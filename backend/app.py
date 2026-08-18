import os
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from PyPDF2 import PdfReader
from docx import Document
import whisper
import tempfile
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow all origins

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

whisper_model = None


def get_whisper_model():
    """Load Whisper only when an audio endpoint is used."""
    global whisper_model
    if whisper_model is None:
        whisper_model = whisper.load_model(
            os.getenv("WHISPER_MODEL", "base")
        )
    return whisper_model


def extract_text_from_file(uploaded_file):
    """Return plain text from a supported uploaded document."""
    filename = (uploaded_file.filename or "").lower()

    if filename.endswith(".txt"):
        return uploaded_file.read().decode("utf-8")

    if filename.endswith(".pdf"):
        reader = PdfReader(uploaded_file)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if filename.endswith(".docx"):
        doc = Document(uploaded_file)
        return "\n".join(paragraph.text for paragraph in doc.paragraphs)

    raise ValueError("Unsupported file type. Upload a PDF, DOCX, or TXT file.")


@app.route("/")
def home():
    return "novaXplain Backend Running"


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.json
        text = data.get("text", "")

        prompt = f"""
Analyze this English text.

Use EXACTLY this format:

[SCORE OUT OF 10]
score here

[GRAMMAR]
grammar feedback here

[VOCABULARY]
vocabulary feedback here

[SUGGESTIONS]
suggestions here

[SIMPLIFIED]
simplified version here

[PROFESSIONAL]
professional version here

Text:
{text}
"""

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )

        return jsonify({"result": response.text})

    except Exception as e:
        print("Gemini Error:", e)
        return jsonify({"result": f"⚠️ Error: {str(e)}"})


@app.route("/extract-text", methods=["POST"])
def extract_text():
    uploaded_file = request.files.get("file")

    if uploaded_file is None:
        return jsonify({"error": "Please upload a file."}), 400

    try:
        text = extract_text_from_file(uploaded_file)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify({"text": text})


@app.route("/transcribe-audio", methods=["POST"])
def transcribe_audio():
    audio = request.files["audio"]

    suffix = os.path.splitext(audio.filename or ".webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        audio.save(temp_file.name)
        temp_path = temp_file.name

    try:
        uploaded = client.files.upload(file=temp_path)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                "Transcribe this audio accurately. Return only the transcription text, nothing else.",
                uploaded
            ]
        )
        text = response.text.strip()
    finally:
        os.remove(temp_path)

    return jsonify({"text": text})


@app.route("/download-pdf", methods=["POST"])
def download_pdf():
    data = request.json
    analysis = data.get("analysis", "")

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(pdf_buffer)
    styles = getSampleStyleSheet()
    content = []

    content.append(Paragraph("novaXplain English Analysis Report", styles["Title"]))
    content.append(Spacer(1, 12))
    content.append(Paragraph(analysis.replace("\n", "<br/>"), styles["BodyText"]))

    doc.build(content)
    pdf_buffer.seek(0)

    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name="novaXplain_Report.pdf",
        mimetype="application/pdf"
    )


@app.route("/generate-notes", methods=["POST"])
def generate_notes():
    import time

    audio = request.files.get("audio")
    document = request.files.get("file")

    if audio:
        source = "audio"
        # Save audio to a temp file and use Gemini's audio API
        # This avoids loading Whisper (needs 2GB RAM) on the free tier
        suffix = os.path.splitext(audio.filename or ".mp3")[1] or ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            audio.save(temp_file.name)
            temp_path = temp_file.name

        try:
            uploaded = client.files.upload(file=temp_path)
            transcript_response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    "Transcribe this audio accurately. Return only the transcription text, nothing else.",
                    uploaded
                ]
            )
            transcript = transcript_response.text.strip()
        finally:
            os.remove(temp_path)

    elif document:
        source = "document"
        try:
            transcript = extract_text_from_file(document)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

    else:
        return jsonify({
            "error": "Please upload an audio file, PDF, DOCX, or TXT file."
        }), 400


    prompt = f"""
Create professional study notes from the transcript below.

Transcript:
{transcript}

Provide the output in this format:

1. SUMMARY

2. KEY POINTS

3. ACTION ITEMS

Make the notes clear, concise, and useful for studying.
"""

    notes = ""

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            notes = response.text
            break
        except Exception as e:
            print("Gemini Error:", e)
            time.sleep(8)

    if notes == "":
        notes = "⚠️ AI service is currently busy or the Gemini quota has been exceeded.\n\nPlease wait a minute and try again."

    return jsonify({
        "transcript": transcript,
        "notes": notes,
        "source": source
    })


@app.route("/download-notes-pdf", methods=["POST"])
def download_notes_pdf():
    data = request.json
    transcript = data.get("transcript", "")
    notes = data.get("notes", "")

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(pdf_buffer)
    styles = getSampleStyleSheet()
    content = []

    content.append(Paragraph("novaXplain Notes Report", styles["Title"]))
    content.append(Spacer(1, 12))
    content.append(Paragraph("<b>Transcript</b>", styles["Heading2"]))
    content.append(Paragraph(transcript, styles["BodyText"]))
    content.append(Spacer(1, 12))
    content.append(Paragraph("<b>Generated Notes</b>", styles["Heading2"]))
    content.append(Paragraph(notes.replace("\n", "<br/>"), styles["BodyText"]))

    doc.build(content)
    pdf_buffer.seek(0)

    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name="novaXplain_Notes.pdf",
        mimetype="application/pdf"
    )


if __name__ == "__main__":
    app.run(debug=True)
