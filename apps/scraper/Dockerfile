FROM python:3.11-slim

WORKDIR /app

# Install system deps for Playwright
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install poetry --no-cache-dir

COPY pyproject.toml ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --only main

# Install Playwright browsers
RUN playwright install chromium --with-deps

COPY src/ ./src/

# Run the FastAPI server + embedded APScheduler
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080"]
