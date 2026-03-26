FROM python:3.12-slim

WORKDIR /app

# Use Chinese pip mirror for faster downloads
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# Install Python deps
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
