FROM python:3.12-slim

WORKDIR /app

# System deps for media processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libheif-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
