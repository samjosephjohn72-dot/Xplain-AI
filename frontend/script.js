let latestNotes = "";
let latestTranscript = "";
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let latestAnalysis = "";
const API_BASE_URL = (window.NOVAXPLAIN_API_URL || "http://127.0.0.1:5000")
    .replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;

function removeBoldMarkers(text) {
    return (text || "").replace(/\*\*/g, "");
}

async function loadDocument() {

    const fileInput =
        document.getElementById("textFile");

    const file =
        fileInput.files[0];

    if (!file) return;

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    const response =
        await fetch(
            apiUrl("/extract-text"),
            {
                method: "POST",
                body: formData
            }
        );

    const data =
        await response.json();

    document.querySelector(
        "textarea"
    ).value = data.text;
}

    
async function analyzeText() {

    const spinner =
    document.getElementById(
        "loadingSpinner"
    );

spinner.style.display = "block";

    const analyzeBtn =
    document.getElementById("analyzeBtn");

analyzeBtn.disabled = true;

analyzeBtn.innerHTML =
    "Analyzing...";

    const textArea = document.querySelector("textarea");

    const text = textArea.value;

    if (!text.trim()) {
        alert("Please enter some text.");
        return;
    }

    const resultContent =
        document.getElementById("resultContent");

    resultContent.innerHTML =
        "⏳ Analyzing...";

    try {

         const response = await fetch(
    apiUrl("/analyze"),
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text: text
        })
    }
);

const data = await response.json();
const result = removeBoldMarkers(data.result);

latestAnalysis = result;

function getSection(start, end) {

    const regex = new RegExp(
        `\\[${start}\\]([\\s\\S]*?)\\[${end}\\]`
    );

    const match = result.match(regex);

    return match ? match[1].trim() : "";
}

const score =
    getSection("SCORE OUT OF 10","GRAMMAR");

const grammar =
    getSection("GRAMMAR","VOCABULARY");

const vocabulary =
    getSection("VOCABULARY","SUGGESTIONS");

const suggestions =
    getSection("SUGGESTIONS","SIMPLIFIED");

const simplified =
    getSection("SIMPLIFIED","PROFESSIONAL");

const professional =
    result.split("[PROFESSIONAL]")[1]?.trim() || "";
    resultContent.innerHTML = `

<div class="analysis-card score-card">
    <h3>English Score</h3>
    <div class="score">${score}</div>
</div>

<div class="analysis-card">
    <h3>Grammar Issues</h3>
    <p>${grammar}</p>
</div>

<div class="analysis-card">
    <h3>Vocabulary Feedback</h3>
    <p>${vocabulary}</p>
</div>

<div class="analysis-card">
    <h3>Suggestions</h3>
    <p>${suggestions}</p>
</div>

<div class="analysis-card">
    <h3>Simplified Version</h3>
    <p>${simplified}</p>
</div>

<div class="analysis-card">
    <h3>Professional Version</h3>
    <p>${professional}</p>
</div>

`;
    }
    catch(error){
        spinner.style.display = "none";
        analyzeBtn.disabled = false;

         analyzeBtn.innerHTML =
        "Analyze English";
        resultContent.innerHTML =
            "❌ Failed to analyze.";

        console.error(error);
    }
    finally{

    spinner.style.display = "none";

    analyzeBtn.disabled = false;

    analyzeBtn.innerHTML =
        "Analyze English";
}
}
async function uploadAudio() {

    const file =
        document.getElementById(
            "audioFile"
        ).files[0];

    if (!file) return;

    const formData =
        new FormData();

    formData.append(
        "audio",
        file
    );

    const response =
        await fetch(
            apiUrl("/transcribe-audio"),
            {
                method:"POST",
                body:formData
            }
        );

    const data =
        await response.json();

    document.querySelector(
        "textarea"
    ).value = data.text;
}
async function toggleRecording() {

    const button =
        document.getElementById("recordBtn");

    if (!isRecording) {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        mediaRecorder =
            new MediaRecorder(stream);

        audioChunks = [];

        mediaRecorder.ondataavailable =
            event => {
                audioChunks.push(event.data);
            };

        mediaRecorder.start();

        isRecording = true;

        button.innerHTML =
            "🔴 Recording... Click to Stop";

    }
    else {

        mediaRecorder.stop();

        isRecording = false;

        button.innerHTML =
            "⏳ Transcribing...";

        mediaRecorder.onstop =
            async () => {

                const audioBlob =
                    new Blob(audioChunks, {
                        type:"audio/webm"
                    });

                const formData =
                    new FormData();

                formData.append(
                    "audio",
                    audioBlob,
                    "recording.webm"
                );

                const response =
                    await fetch(
                        apiUrl("/transcribe-audio"),
                        {
                            method:"POST",
                            body:formData
                        }
                    );

                const data =
                    await response.json();

                document.querySelector(
                    "textarea"
                ).value = data.text;

                button.innerHTML =
                    "🎤 Start Recording";
            };
    }
}
async function downloadPDF() {

    if (!latestAnalysis) {

        alert(
            "Please analyze text first."
        );

        return;
    }

    const response =
        await fetch(
            apiUrl("/download-pdf"),
            {
                method:"POST",

                headers:{
                    "Content-Type":
                    "application/json"
                },

                body:JSON.stringify({
                    analysis:
                    latestAnalysis
                })
            }
        );

    const blob =
        await response.blob();

    const url =
        window.URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;

    a.download =
        "novaXplain_Report.pdf";

    a.click();

    window.URL.revokeObjectURL(url);
}
async function generateNotes() {

    const file =
        document.getElementById("notesInput").files[0];

    if (!file) {

        alert("Please upload an audio file, PDF, DOCX, or TXT file.");

        return;
    }

    const result =
        document.getElementById("notesResult");

    result.innerHTML =
        "<h3>⏳ Generating Notes...</h3>";

    const formData =
        new FormData();

    const isAudio = file.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a)$/i.test(file.name);

    formData.append(isAudio ? "audio" : "file", file);

    try {

        const response =
            await fetch(
                apiUrl("/generate-notes"),
                {
                    method: "POST",
                    body: formData
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to generate notes.");
        }

        // Save globally for PDF download
        latestTranscript = removeBoldMarkers(data.transcript);
        latestNotes = removeBoldMarkers(data.notes);
        const sourceHeading = data.source === "document"
            ? "Extracted Text"
            : "Transcript";

        result.innerHTML = `
            <h3>${sourceHeading}</h3>
            <p>${latestTranscript}</p>

            <h3>Generated Notes</h3>
            <pre>${latestNotes}</pre>
        `;

        console.log("Transcript Saved:", latestTranscript);
        console.log("Notes Saved:", latestNotes);

    } catch (error) {

        console.error(error);

        result.innerHTML =
            "<h3>❌ Error generating notes.</h3>";
    }
}
async function downloadNotesPDF() {

    if (!latestNotes) {
        console.log("Notes:", latestNotes);

        alert("Generate notes first.");

        return;
    }

    const response =
        await fetch(
            apiUrl("/download-notes-pdf"),
            {
                method: "POST",

                headers: {
                    "Content-Type":
                    "application/json"
                },

                body: JSON.stringify({
                    transcript:
                    latestTranscript,

                    notes:
                    latestNotes
                })
            }
        );

    const blob =
        await response.blob();

    const url =
        window.URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;

    a.download =
        "novaXplain_Notes.pdf";

    a.click();

    window.URL.revokeObjectURL(url);
}
