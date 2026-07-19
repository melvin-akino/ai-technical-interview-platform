FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    nodejs \
    golang-go \
    php-cli \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash sandboxuser

# Pre-warm the Go build cache so candidate code doesn't pay a cold-compile cost. A first
# `go run` compiles the standard library from scratch (~17s on this box) — way past the
# sandbox's 3s CPU limit — while a warm cache brings it down to ~0.1s. Baking this into the
# image means every container starts warm.
RUN mkdir -p /opt/gocache && chmod 777 /opt/gocache \
    && printf 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }\n' > /tmp/warm.go \
    && GOCACHE=/opt/gocache go run /tmp/warm.go \
    && rm /tmp/warm.go

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
