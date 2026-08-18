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
    const fileInput = document.getElementById("textFile");
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(apiUrl("/extract-text"), {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            alert(data.error || "Failed to extract text from file.");
            return;
        }

        document.querySelector("textarea").value = data.text;
    } catch (err) {
        console.error(err);
        alert("Failed to extract text. Please check connection.");
    }
}

async function analyzeText() {
    const spinner = document.getElementById("loadingSpinner");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const resultContent = document.getElementById("resultContent");
    const textArea = document.querySelector("textarea");
    const text = textArea.value;

    if (!text.trim()) {
        alert("Please enter some text.");
        return;
    }

    spinner.style.display = "block";
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = "Analyzing...";
    resultContent.innerHTML = "⏳ Analyzing...";

    try {
        const response = await fetch(apiUrl("/analyze"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text
            })
        });

        let data;
        const textResponse = await response.text();
        try {
            data = JSON.parse(textResponse);
        } catch (_) {
            throw new Error("Server returned an invalid response. Please try again.");
        }

        if (!response.ok) {
            throw new Error(data.error || "Failed to analyze text.");
        }

        const result = removeBoldMarkers(data.result);
        latestAnalysis = result;

        function getSection(start, end) {
            const regex = new RegExp(`\\[${start}\\]([\\s\\S]*?)\\[${end}\\]`);
            const match = result.match(regex);
            return match ? match[1].trim() : "";
        }

        if (!result.includes("[SCORE OUT OF 10]")) {
            resultContent.innerHTML = `
                <div class="analysis-card">
                    <h3>Analysis Result</h3>
                    <p style="white-space: pre-wrap;">${result}</p>
                </div>
            `;
            return;
        }

        const score = getSection("SCORE OUT OF 10", "GRAMMAR");
        const grammar = getSection("GRAMMAR", "VOCABULARY");
        const vocabulary = getSection("VOCABULARY", "SUGGESTIONS");
        const suggestions = getSection("SUGGESTIONS", "SIMPLIFIED");
        const simplified = getSection("SIMPLIFIED", "PROFESSIONAL");
        const professional = result.split("[PROFESSIONAL]")[1]?.trim() || "";

        resultContent.innerHTML = `
            <div class="analysis-card score-card">
                <h3>English Score</h3>
                <div class="score">${score || "N/A"}</div>
            </div>

            <div class="analysis-card">
                <h3>Grammar Issues</h3>
                <p>${grammar || "None detected"}</p>
            </div>

            <div class="analysis-card">
                <h3>Vocabulary Feedback</h3>
                <p>${vocabulary || "Good"}</p>
            </div>

            <div class="analysis-card">
                <h3>Suggestions</h3>
                <p>${suggestions || "None"}</p>
            </div>

            <div class="analysis-card">
                <h3>Simplified Version</h3>
                <p>${simplified || text}</p>
            </div>

            <div class="analysis-card">
                <h3>Professional Version</h3>
                <p>${professional || text}</p>
            </div>
        `;
    } catch (error) {
        console.error(error);
        resultContent.innerHTML = `<p style="color: #ff6b6b; font-weight: bold; padding: 12px; background: rgba(255,0,0,0.1); border-radius: 8px;">❌ ${error.message || "Failed to analyze."}</p>`;
    } finally {
        spinner.style.display = "none";
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = "Analyze English";
    }
}

async function uploadAudio() {
    const file = document.getElementById("audioFile").files[0];
    if (!file) return;

    const textArea = document.querySelector("textarea");
    textArea.value = "⏳ Transcribing audio...";

    const formData = new FormData();
    formData.append("audio", file);

    try {
        const response = await fetch(apiUrl("/transcribe-audio"), {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            alert(data.error || "Failed to transcribe audio.");
            textArea.value = "";
            return;
        }

        textArea.value = data.text;
    } catch (err) {
        console.error(err);
        alert("Error transcribing audio.");
        textArea.value = "";
    }
}

async function toggleRecording() {
    const button = document.getElementById("recordBtn");

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.start();
            isRecording = true;
            button.innerHTML = "🔴 Recording... Click to Stop";
        } catch (e) {
            alert("Microphone access denied or not available.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        button.innerHTML = "⏳ Transcribing...";

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");

            try {
                const response = await fetch(apiUrl("/transcribe-audio"), {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();
                if (response.ok) {
                    document.querySelector("textarea").value = data.text;
                } else {
                    alert(data.error || "Failed to transcribe recording.");
                }
            } catch (err) {
                console.error(err);
                alert("Error during transcription.");
            } finally {
                button.innerHTML = "🎤 Start Recording";
            }
        };
    }
}

async function downloadPDF() {
    if (!latestAnalysis) {
        alert("Please analyze text first.");
        return;
    }

    try {
        const response = await fetch(apiUrl("/download-pdf"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                analysis: latestAnalysis
            })
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "novaXplain_Report.pdf";
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert("Failed to download PDF.");
    }
}

async function generateNotes() {
    const fileInput = document.getElementById("notesInput");
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
        alert("Please upload an audio file, PDF, DOCX, or TXT file.");
        return;
    }

    const result = document.getElementById("notesResult");
    result.innerHTML = "<h3>⏳ Generating Notes (this may take a few seconds)...</h3>";

    const formData = new FormData();
    const isAudio = file.type.startsWith("audio/") || /\.(mp3|wav|m4a|webm|ogg)$/i.test(file.name);
    formData.append(isAudio ? "audio" : "file", file);

    try {
        const response = await fetch(apiUrl("/generate-notes"), {
            method: "POST",
            body: formData
        });

        let data;
        const textResponse = await response.text();
        try {
            data = JSON.parse(textResponse);
        } catch (_) {
            throw new Error("Server returned an invalid response. Please try again.");
        }

        if (!response.ok) {
            throw new Error(data.error || "Unable to generate notes.");
        }

        latestTranscript = removeBoldMarkers(data.transcript);
        latestNotes = removeBoldMarkers(data.notes);
        const sourceHeading = data.source === "document" ? "Extracted Text" : "Transcript";

        result.innerHTML = `
            <h3>${sourceHeading}</h3>
            <p style="white-space: pre-wrap;">${latestTranscript}</p>

            <h3>Generated Notes</h3>
            <pre style="white-space: pre-wrap; font-family: inherit;">${latestNotes}</pre>
        `;

        console.log("Transcript Saved:", latestTranscript);
        console.log("Notes Saved:", latestNotes);
    } catch (error) {
        console.error(error);
        result.innerHTML = `<h3 style="color: #ff6b6b;">❌ ${error.message || "Error generating notes."}</h3>`;
    }
}

async function downloadNotesPDF() {
    if (!latestNotes) {
        alert("Generate notes first.");
        return;
    }

    try {
        const response = await fetch(apiUrl("/download-notes-pdf"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                transcript: latestTranscript,
                notes: latestNotes
            })
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "novaXplain_Notes.pdf";
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert("Failed to download notes PDF.");
    }
}
