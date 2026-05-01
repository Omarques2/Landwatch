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
    curl \
    golang-go \
    gdal-bin \
    libgdal-dev \
    tippecanoe \
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

RUN GOBIN=/usr/local/bin go install github.com/protomaps/go-pmtiles@v1.27.1 \
    && ln -sf /usr/local/bin/go-pmtiles /usr/local/bin/pmtiles

COPY apps/Versionamento /app

CMD ["python", "jobs/run_job.py"]
