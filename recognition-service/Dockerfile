# Asset recognition service -- CPU-only inference (CLIP embeddings + a
# COCO detector + contour segmentation for multi-object photos). Never
# exposed outside the docker network in production; backend/src/recognition/
# is the only caller (see recognition-service/README.md).
#
# Self-contained build context (this directory), unlike backend/frontend
# which pull shared files from the repo root -- this service has no
# cross-directory dependencies.

FROM python:3.11-slim

# opencv-python-headless still links against a couple of system libs on
# Debian slim images even in headless mode -- common gotcha, guard against
# it upfront rather than debugging a cryptic ImportError at container start.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Model weight downloads (CLIP + detector, ~430MB combined) land here and
# get baked into this image layer at build time via the warm_up() step below
# -- deliberate, so the running container never needs outbound internet
# access. Matters for an on-prem deployment that may not have it, and avoids
# a slow/fragile first request.
ENV HF_HOME=/app/.cache \
    TORCH_HOME=/app/.cache/torch \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Forces both models to download now, not on the first real request.
RUN python -c "from app import embedding, detection; embedding.warm_up(); detection.warm_up()"

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/data/chroma /app/data/images \
    && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
