FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8100

ENV TYPHOON_API_URL=${TYPHOON_API_URL:-https://api.opentyphoon.ai/v1}
ENV TYPHOON_MODEL=${TYPHOON_MODEL:-typhoon-ocr}

CMD ["python", "server.py"]
