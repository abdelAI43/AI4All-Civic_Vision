FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY deploy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the deployed FastAPI app and persisted vectorstores from the repo root.
COPY deploy/app/ ./app/
COPY deploy/data/vectorstores/ ./data/vectorstores/

EXPOSE 8001

CMD ["sh", "-c", "cd /app/app && python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
