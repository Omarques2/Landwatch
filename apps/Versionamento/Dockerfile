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

# SICAR package from GitHub (pinned: v0.8.0+ requires Python >= 3.12)
RUN pip install --no-cache-dir git+https://github.com/urbanogilson/SICAR@v0.7.7

# Prebuilt release binary: compiling with `go install` pulls ~100 modules and
# fails whenever the Go proxy/checksum DB hiccups.
ARG PMTILES_VERSION=1.27.1
RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) pmtiles_arch=x86_64 ;; \
         arm64) pmtiles_arch=arm64 ;; \
         *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL --retry 5 --retry-delay 5 -o /tmp/pmtiles.tar.gz \
         "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${pmtiles_arch}.tar.gz" \
    && tar -xzf /tmp/pmtiles.tar.gz -C /usr/local/bin pmtiles \
    && rm /tmp/pmtiles.tar.gz \
    && ln -sf /usr/local/bin/pmtiles /usr/local/bin/go-pmtiles \
    && test -x /usr/local/bin/pmtiles

COPY apps/Versionamento /app

CMD ["python", "jobs/run_job.py"]
