FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY assets ./assets
ENV OUTPUT_DIR=/app/outputs
ENV PUBLIC_BASE_URL=http://localhost:8000
ENV GENERATE_API_TOKEN=change-me
RUN mkdir -p /app/outputs
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
