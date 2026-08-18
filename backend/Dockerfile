FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Whisper relies on FFmpeg to decode uploaded audio files.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Download the selected Whisper model during the image build so the first
# transcription request does not need to download it at runtime.
RUN python -c "import whisper; whisper.load_model('base')"

CMD gunicorn app:app --bind 0.0.0.0:${PORT:-10000} --timeout 300 --workers 1
