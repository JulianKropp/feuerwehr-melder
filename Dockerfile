# syntax=docker/dockerfile:1
FROM python:3.11-slim

# Prevents Python from writing .pyc files and enables unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install dependencies first (leverage Docker layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py ./
COPY app ./app

# Expose the application port
EXPOSE 8000

# Start the FastAPI app with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
