FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NEXTAPI_REPO_ROOT=/app

WORKDIR /app

COPY services/director_sidecar/requirements.txt /app/services/director_sidecar/requirements.txt
RUN pip install --no-cache-dir -r /app/services/director_sidecar/requirements.txt

COPY services/director_sidecar /app/services/director_sidecar
COPY third_party/vimax /app/third_party/vimax

EXPOSE 8091

CMD ["uvicorn", "services.director_sidecar.app:app", "--host", "0.0.0.0", "--port", "8091"]
