# AuraInterview - GCP Free Tier Deployer (PowerShell)
# Check gcloud CLI
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "gcloud CLI is not installed. Please install it first."
    exit
}

# Verify active project
$activeProject = gcloud config get-value project 2>$null
if (-not $activeProject) {
    Write-Error "No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>'."
    exit
}

Write-Host "Deploying to active GCP Project: $activeProject"

# Get Gemini API key
$geminiApiKey = $env:GEMINI_API_KEY
if (-not $geminiApiKey -and (Test-Path .env)) {
    $envFile = Get-Content .env
    foreach ($line in $envFile) {
        if ($line -match "^GEMINI_API_KEY=(.*)$") {
            $geminiApiKey = $Matches[1]
        }
    }
}

if (-not $geminiApiKey) {
    $geminiApiKey = Read-Host -Prompt "Enter your GEMINI_API_KEY"
}

if (-not $geminiApiKey) {
    Write-Error "GEMINI_API_KEY is required."
    exit
}

# Config
$zone = "us-central1-a"
$vmName = "aura-interview-platform"

# Enable Compute Engine API
Write-Host "Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com

# Create Firewall Rule
Write-Host "Setting up network firewall rules..."
$ruleExists = gcloud compute firewall-rules describe allow-aura-ports 2>$null
if (-not $ruleExists) {
    gcloud compute firewall-rules create allow-aura-ports `
        --allow="tcp:5173,tcp:8000" `
        --target-tags=aura-server `
        --description="Allow AuraInterview Frontend (5173) and Backend API (8000)"
}

# Create VM
Write-Host "Creating GCE VM Instance..."
$vmExists = gcloud compute instances describe $vmName --zone $zone 2>$null
if (-not $vmExists) {
    gcloud compute instances create $vmName `
        --zone $zone `
        --machine-type="e2-micro" `
        --image-family="debian-11" `
        --image-project="debian-cloud" `
        --boot-disk-size="30GB" `
        --boot-disk-type="pd-standard" `
        --tags=aura-server,http-server,https-server
}

# Wait for IP
Write-Host "Fetching external IP..."
Start-Sleep -Seconds 10
$externalIp = (gcloud compute instances describe $vmName --zone $zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)").Trim()
Write-Host "VM Ready at IP: $externalIp"

# Package files (create tar.gz using native tar)
Write-Host "Packaging project files..."
$archiveName = "aura_deploy.tar.gz"

tar --exclude="node_modules" `
    --exclude="frontend/node_modules" `
    --exclude="backend/__pycache__" `
    --exclude="backend/.pytest_cache" `
    --exclude="backend/ai_interview.db" `
    --exclude="*.db" `
    --exclude=".git" `
    --exclude=".agents" `
    --exclude="venv" `
    --exclude=".env" `
    -czf $archiveName .

# Upload
Write-Host "Uploading to VM..."
gcloud compute scp $archiveName "${vmName}:~/" --zone $zone --quiet

# Clean local archive
Remove-Item $archiveName

# SSH setup
Write-Host "Running remote setup..."
$remoteCmd = @"
set -e
if ! command -v docker &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
fi
rm -rf aura-interview
mkdir aura-interview
tar -xzf aura_deploy.tar.gz -C aura-interview/
rm -f aura_deploy.tar.gz
cd aura-interview
cat << EOF > .env
GEMINI_API_KEY=$geminiApiKey
VITE_API_URL=http://$externalIp:8000
EOF
sudo docker-compose down || true
sudo docker-compose up -d --build
sudo docker ps
"@

gcloud compute ssh $vmName --zone $zone --quiet --command=$remoteCmd

Write-Host "========================================="
Write-Host "🎉 DEPLOYMENT SUCCESSFUL!"
Write-Host "Frontend URL: http://$externalIp:5173"
Write-Host "Backend API:  http://$externalIp:8000"
Write-Host "========================================="
