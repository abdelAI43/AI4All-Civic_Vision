FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy vectorstores (large layer — cached between deploys if unchanged)
COPY data/vectorstores/ ./data/vectorstores/

# Expose port (Render injects $PORT at runtime)
EXPOSE 8001

# Run uvicorn, reading PORT from environment
CMD ["sh", "-c", "cd /app/app && python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
