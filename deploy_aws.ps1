# AuraInterview - AWS Single-Instance Production Deployment Orchestrator
# Assumes AWS CLI is configured with credentials.
# Builds Docker images locally and ships the built images (no build step runs on the EC2 box).
# Always uses Windows' built-in OpenSSH client (ssh/scp), not whatever ssh.exe a shell's PATH
# resolves to first — Git for Windows bundles an ancient OpenSSH 7.1 that can't produce the
# RSA-SHA2 signatures modern sshd requires and silently fails pubkey auth.

param(
    [string]$GeminiApiKey = ""
)

$ErrorActionPreference = "Stop"

$SSH = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$SCP = "$env:WINDIR\System32\OpenSSH\scp.exe"
if (-not (Test-Path $SSH) -or -not (Test-Path $SCP)) {
    Write-Host "ERROR: Windows OpenSSH client not found at $SSH. Install the 'OpenSSH Client' optional Windows feature." -ForegroundColor Red
    Exit 1
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  AuraInterview AWS Free-Tier Deployer" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Check AWS Configuration
Write-Host "Checking AWS configuration..." -ForegroundColor Yellow
try {
    $awsRegion = aws configure get region --no-verify-ssl
    Write-Host "Target Region: $awsRegion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: AWS credentials or region are not configured." -ForegroundColor Red
    Write-Host "Please run 'aws configure' and enter your AWS Access Key, Secret Key, and Region." -ForegroundColor Yellow
    Exit
}

# Prompt for Gemini API Key (or accept it via -GeminiApiKey when running non-interactively)
if ([string]::IsNullOrEmpty($GeminiApiKey)) {
    $geminiKey = Read-Host "Enter your GEMINI_API_KEY (for Spoken Voice Interviews)"
} else {
    $geminiKey = $GeminiApiKey
}
if ([string]::IsNullOrEmpty($geminiKey)) {
    Write-Host "Warning: GEMINI_API_KEY is empty. Voice features may fail." -ForegroundColor Yellow
}

# 2. Build Docker images locally (targeting linux/amd64, matching the EC2 instance type)
Write-Host "Building backend image locally..." -ForegroundColor Yellow
docker build --platform linux/amd64 -t aurainterview-backend:latest ./backend
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Backend image build failed." -ForegroundColor Red; Exit 1 }

Write-Host "Building frontend image locally..." -ForegroundColor Yellow
docker build --platform linux/amd64 -f ./frontend/Dockerfile.prod -t aurainterview-frontend:latest ./frontend
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend image build failed." -ForegroundColor Red; Exit 1 }

Write-Host "Saving images to a tarball..." -ForegroundColor Yellow
$imagesTar = "deploy-images.tar"
if (Test-Path $imagesTar) { Remove-Item -Force $imagesTar }
docker save -o $imagesTar aurainterview-backend:latest aurainterview-frontend:latest
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $imagesTar)) { Write-Host "ERROR: Failed to save Docker images." -ForegroundColor Red; Exit 1 }
Write-Host "Images saved: $imagesTar" -ForegroundColor Green

# 3. Write the deploy-time compose file (references the pre-built images; no build step remotely)
$composeContent = @"
services:
  db:
    image: postgres:15-alpine
    container_name: ai_interview_db_prod
    restart: always
    environment:
      POSTGRES_USER: interview_user
      POSTGRES_PASSWORD: interview_secure_password
      POSTGRES_DB: ai_interview_db
    volumes:
      - pgdata_prod:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U interview_user -d ai_interview_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    image: aurainterview-backend:latest
    container_name: ai_interview_backend_prod
    restart: always
    environment:
      - DATABASE_URL=postgresql://interview_user:interview_secure_password@db:5432/ai_interview_db
      - GEMINI_API_KEY=`${GEMINI_API_KEY}
    depends_on:
      db:
        condition: service_healthy

  frontend:
    image: aurainterview-frontend:latest
    container_name: ai_interview_frontend_prod
    restart: always
    depends_on:
      - backend

  caddy:
    image: caddy:2-alpine
    container_name: ai_interview_caddy_prod
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend

volumes:
  pgdata_prod:
  caddy_data:
  caddy_config:
"@
Set-Content -Path docker-compose.deploy.yml -Value $composeContent -NoNewline -Encoding utf8NoBOM

# 4. Provision AWS Infrastructure
Write-Host "Creating EC2 Key Pair (aurainterview-key)..." -ForegroundColor Yellow
# aws cli emits an InsecureRequestWarning to stderr because of --no-verify-ssl; with
# $ErrorActionPreference = "Stop" that gets treated as a terminating error, so relax it
# for the remaining native aws/ssh/tar calls and rely on explicit $LASTEXITCODE checks instead.
$ErrorActionPreference = "Continue"

if (Test-Path aurainterview-key.pem) {
    icacls "aurainterview-key.pem" /grant:r "$($env:USERNAME):(F)" | Out-Null
    Remove-Item -Force aurainterview-key.pem
}

$existingKey = aws ec2 describe-key-pairs --key-names aurainterview-key --query "KeyPairs[0].KeyName" --output text --no-verify-ssl
if ($LASTEXITCODE -eq 0 -and $existingKey -eq "aurainterview-key") {
    Write-Host "Key pair 'aurainterview-key' already exists in AWS but its private key is not recoverable." -ForegroundColor Yellow
    Write-Host "Deleting and recreating it so a fresh, usable .pem can be saved..." -ForegroundColor Yellow
    aws ec2 delete-key-pair --key-name aurainterview-key --no-verify-ssl | Out-Null
}
# ED25519 (not RSA): even with Windows' own OpenSSH client this sidesteps any RSA-SHA2
# algorithm-negotiation edge cases entirely, and its keys are far shorter to boot.
$keyLines = aws ec2 create-key-pair --key-name aurainterview-key --key-type ed25519 --query "KeyMaterial" --output text --no-verify-ssl
if ($LASTEXITCODE -eq 0 -and $keyLines) {
    # Captured multi-line CLI output must be rejoined with real newlines, and written via
    # .NET (not `>`/Out-File, which defaults to UTF-16LE) as plain UTF-8 without a BOM.
    # Getting either wrong silently corrupts the key: SSH either can't parse it or, worse,
    # accepts a key whose derived public half matches but whose signing fails.
    $pemContent = ($keyLines -join "`n") + "`n"
    [System.IO.File]::WriteAllText("$PWD\aurainterview-key.pem", $pemContent, (New-Object System.Text.UTF8Encoding $false))
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path aurainterview-key.pem) -or (Get-Item aurainterview-key.pem).Length -eq 0) {
    Write-Host "ERROR: Failed to create/save the EC2 key pair. Aborting before infrastructure changes." -ForegroundColor Red
    Exit 1
}
icacls "aurainterview-key.pem" /inheritance:r | Out-Null
icacls "aurainterview-key.pem" /grant:r "$($env:USERNAME):(R)" | Out-Null
Write-Host "Key pair saved to aurainterview-key.pem" -ForegroundColor Green

Write-Host "Creating Security Group (AuraInterviewSG)..." -ForegroundColor Yellow
$sgId = ""
$sgResult = aws ec2 create-security-group --group-name AuraInterviewSG --description "AuraInterview Security Group" --output json --no-verify-ssl | ConvertFrom-Json
if ($LASTEXITCODE -eq 0 -and $sgResult.GroupId) {
    $sgId = $sgResult.GroupId
    Write-Host "Security Group created: $sgId" -ForegroundColor Green

    # Inbound Rules
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 22 --cidr 0.0.0.0/0 --no-verify-ssl | Out-Null
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 --no-verify-ssl | Out-Null
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 443 --cidr 0.0.0.0/0 --no-verify-ssl | Out-Null
    Write-Host "Security Group rules configured (SSH, HTTP, HTTPS)." -ForegroundColor Green
} else {
    Write-Host "Security Group 'AuraInterviewSG' already exists, retrieving ID..." -ForegroundColor Yellow
    $sgId = (aws ec2 describe-security-groups --group-names AuraInterviewSG --query "SecurityGroups[0].GroupId" --output text --no-verify-ssl)
}
if ([string]::IsNullOrWhiteSpace($sgId) -or $sgId -eq "None") {
    Write-Host "ERROR: Could not resolve a security group ID. Aborting before launching an instance." -ForegroundColor Red
    Exit 1
}

# Resolve standard Amazon Linux 2023 AMI in Singapore
Write-Host "Resolving latest Amazon Linux 2023 AMI..." -ForegroundColor Yellow
$amiId = "ami-0df7a207adb974829" # Fallback Singapore AMI
try {
    $queriedAmi = aws ec2 describe-images --owners amazon --filters "Name=name,Values=al2023-ami-2023.*-x86_64" --query "Images[0].ImageId" --output text --no-verify-ssl
    if ($queriedAmi -ne "None") { $amiId = $queriedAmi }
} catch {}
Write-Host "Using AMI ID: $amiId" -ForegroundColor Green

# Prepare User Data Script (Docker Engine + Compose plugin only — no build tooling needed remotely)
Write-Host "Writing EC2 boot configurations..." -ForegroundColor Yellow
$userData = @"
#!/bin/bash
# Enable 1.5GB Swap space to prevent memory spikes
dd if=/dev/zero of=/swapfile bs=128M count=12
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab

# Install Docker
dnf update -y
dnf install -y docker
systemctl start docker
systemctl enable docker

# Install Docker Compose plugin
mkdir -p /usr/local/lib/docker/cli-plugins/
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ln -s /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
"@
# Set-Content (not `>`/Out-File) writes plain UTF-8 without a BOM. cloud-init requires the
# very first two bytes of user-data to be literally "#!" to recognize it as a script; a BOM
# pushes the shebang over by 3 bytes and cloud-init silently ignores the whole script.
Set-Content -Path user_data.sh -Value $userData -NoNewline -Encoding utf8NoBOM

# Launch EC2 Instance
Write-Host "Launching t3.micro EC2 Instance..." -ForegroundColor Yellow
$instanceJson = aws ec2 run-instances `
    --image-id $amiId `
    --instance-type t3.micro `
    --key-name aurainterview-key `
    --security-group-ids $sgId `
    --user-data file://user_data.sh `
    --output json `
    --no-verify-ssl | ConvertFrom-Json

$instanceId = $instanceJson.Instances[0].InstanceId
Write-Host "Instance launched successfully: $instanceId" -ForegroundColor Green

Write-Host "Waiting for Public IP assignment..." -ForegroundColor Yellow
Start-Sleep -Seconds 15
$publicIp = (aws ec2 describe-instances --instance-ids $instanceId --query "Reservations[0].Instances[0].PublicIpAddress" --output text --no-verify-ssl)

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "Deployment Server Active!" -ForegroundColor Green
Write-Host "Public IP Address: $publicIp" -ForegroundColor Green
Write-Host "Instance ID: $instanceId" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green

# Generate a self-signed TLS cert covering this instance's IP (no domain yet, so Caddy's
# on-demand "tls internal" can't issue one for a bare, hostname-less :443 listener).
Write-Host "Generating self-signed TLS certificate for $publicIp..." -ForegroundColor Yellow
$sslCnf = @"
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = aurainterview

[v3_req]
subjectAltName = @alt_names

[alt_names]
IP.1 = $publicIp
DNS.1 = localhost
"@
Set-Content -Path selfsigned.cnf -Value $sslCnf -NoNewline -Encoding utf8NoBOM
openssl req -x509 -nodes -newkey rsa:2048 -keyout selfsigned.key -out selfsigned.crt -days 825 -config selfsigned.cnf 2>$null
if (-not (Test-Path selfsigned.crt) -or -not (Test-Path selfsigned.key)) {
    Write-Host "WARNING: Could not generate a self-signed certificate (openssl not found?). HTTPS will not work until one is added manually." -ForegroundColor Yellow
}

# Output deployment commands (uses Windows' own OpenSSH client explicitly, not PATH-resolved ssh/scp)
$deployScript = @"
`$SSH = "`$env:WINDIR\System32\OpenSSH\ssh.exe"
`$SCP = "`$env:WINDIR\System32\OpenSSH\scp.exe"

# Copy the pre-built images, compose file, Caddyfile, and TLS cert to the host server
& `$SCP -i aurainterview-key.pem -o StrictHostKeyChecking=no $imagesTar docker-compose.deploy.yml Caddyfile selfsigned.crt selfsigned.key ec2-user@$($publicIp):/home/ec2-user/

# Load the images and start the stack (no build step runs on the server)
& `$SSH -i aurainterview-key.pem -o StrictHostKeyChecking=no ec2-user@$($publicIp) "mkdir -p app && mv $imagesTar docker-compose.deploy.yml Caddyfile selfsigned.crt selfsigned.key app/ && cd app && sudo docker load -i $imagesTar && echo 'GEMINI_API_KEY=$geminiKey' > .env && sudo docker compose -f docker-compose.deploy.yml up -d"
"@
Set-Content -Path finish_deployment.ps1 -Value $deployScript -NoNewline -Encoding utf8NoBOM

Write-Host "To complete deployment, wait 2 minutes for EC2 initialization, then run:" -ForegroundColor Yellow
Write-Host ".\finish_deployment.ps1" -ForegroundColor Cyan
