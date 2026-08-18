import os
import tempfile
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from PyPDF2 import PdfReader
from docx import Document
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow all origins

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

# Supported active models in order of priority
MODELS_TO_TRY = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"]


def generate_with_fallback(contents):
    """Generate content with automatic fallback across available Flash models."""
    last_error = None
    for model_name in MODELS_TO_TRY:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents
            )
            if response and response.text:
                return response.text
        except Exception as e:
            print(f"Model {model_name} failed: {e}")
            last_error = e
    raise last_error or RuntimeError("All AI models failed to generate a response.")


def get_audio_mime_type(filename_or_ext):
    """Determine proper audio mime type for Google GenAI files service."""
    ext = (os.path.splitext(filename_or_ext or "")[1] or "").lower()
    mapping = {
        ".mp3": "audio/mp3",
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
    }
    return mapping.get(ext, "audio/mp3")


def extract_text_from_file(uploaded_file):
    """Return plain text from a supported uploaded document."""
    filename = (uploaded_file.filename or "").lower()

    if filename.endswith(".txt"):
        return uploaded_file.read().decode("utf-8", errors="ignore")

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
        data = request.json or {}
        text = data.get("text", "").strip()

        if not text:
            return jsonify({"error": "Please enter some text."}), 400

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

        result_text = generate_with_fallback(prompt)
        return jsonify({"result": result_text})

    except Exception as e:
        print("Gemini Error in /analyze:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/extract-text", methods=["POST"])
def extract_text():
    uploaded_file = request.files.get("file")

    if uploaded_file is None:
        return jsonify({"error": "Please upload a file."}), 400

    try:
        text = extract_text_from_file(uploaded_file)
    except Exception as error:
        return jsonify({"error": str(error)}), 400

    return jsonify({"text": text})


@app.route("/transcribe-audio", methods=["POST"])
def transcribe_audio():
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "No audio file provided."}), 400

    orig_filename = audio.filename or "recording.webm"
    suffix = os.path.splitext(orig_filename)[1] or ".webm"
    mime_type = get_audio_mime_type(orig_filename)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        audio.save(temp_file.name)
        temp_path = temp_file.name

    uploaded_file_ref = None
    try:
        uploaded_file_ref = client.files.upload(
            file=temp_path,
            config={"mime_type": mime_type}
        )
        text = generate_with_fallback([
            "Transcribe this audio accurately. Return only the transcription text, nothing else.",
            uploaded_file_ref
        ]).strip()
    except Exception as e:
        print("Error in transcribe_audio:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if uploaded_file_ref:
            try:
                client.files.delete(name=uploaded_file_ref.name)
            except Exception:
                pass

    return jsonify({"text": text})


@app.route("/download-pdf", methods=["POST"])
def download_pdf():
    data = request.json or {}
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
    try:
        audio = request.files.get("audio")
        document = request.files.get("file")

        if audio:
            source = "audio"
            orig_filename = audio.filename or "audio.mp3"
            suffix = os.path.splitext(orig_filename)[1] or ".mp3"
            mime_type = get_audio_mime_type(orig_filename)

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                audio.save(temp_file.name)
                temp_path = temp_file.name

            uploaded_file_ref = None
            try:
                uploaded_file_ref = client.files.upload(
                    file=temp_path,
                    config={"mime_type": mime_type}
                )
                transcript = generate_with_fallback([
                    "Transcribe this audio accurately. Return only the transcription text, nothing else.",
                    uploaded_file_ref
                ]).strip()
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                if uploaded_file_ref:
                    try:
                        client.files.delete(name=uploaded_file_ref.name)
                    except Exception:
                        pass

        elif document:
            source = "document"
            try:
                transcript = extract_text_from_file(document)
            except Exception as error:
                return jsonify({"error": str(error)}), 400

        else:
            return jsonify({
                "error": "Please upload an audio file, PDF, DOCX, or TXT file."
            }), 400

        if not transcript or not transcript.strip():
            return jsonify({"error": "No text could be extracted from the uploaded file."}), 400

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

        notes = generate_with_fallback(prompt)

        return jsonify({
            "transcript": transcript,
            "notes": notes,
            "source": source
        })

    except Exception as e:
        print("General error in /generate-notes:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/download-notes-pdf", methods=["POST"])
def download_notes_pdf():
    data = request.json or {}
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
