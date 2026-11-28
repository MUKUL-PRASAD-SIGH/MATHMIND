# MathMind API. Build from the repo root (the API reads ../datasets and ../ai/prompts):
#   docker build -f backend/Dockerfile -t mathmind-backend .
#   docker build -f backend/Dockerfile --build-arg WITH_ML=true -t mathmind-backend:ml .   # + pix2tex (CPU torch)
FROM python:3.11-slim

ARG WITH_ML=false
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

COPY backend/requirements.txt backend/requirements-ml.txt ./
RUN pip install -r requirements.txt \
    && if [ "$WITH_ML" = "true" ]; then \
         pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements-ml.txt; \
       fi

COPY backend/app ./app
COPY datasets /app/datasets
COPY ai/prompts /app/ai/prompts

RUN useradd --create-home --uid 1000 mathmind && mkdir -p /app/backend/data && chown -R mathmind /app/backend/data
USER mathmind

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
