FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GDAL_DATA=/usr/share/gdal \
    PROJ_LIB=/usr/share/proj

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    gcc \
    g++ \
    make \
    gdal-bin \
    libgdal-dev \
    tesseract-ocr \
    tesseract-ocr-por \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/Versionamento/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# SICAR package from GitHub
RUN pip install --no-cache-dir git+https://github.com/urbanogilson/SICAR

COPY apps/Versionamento /app

CMD ["python", "jobs/run_job.py"]
