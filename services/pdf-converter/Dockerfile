FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-21-jre-headless && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir --default-timeout=300 --retries 3 \
    opendataloader-pdf fastapi uvicorn Pillow

COPY convert_pdf.py server_std.py .

EXPOSE 8000

CMD ["python", "server_std.py"]
