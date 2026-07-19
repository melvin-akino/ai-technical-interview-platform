#!/bin/bash
set -e

# Configuration
ZONE="us-central1-a"
REGION="us-central1"
MACHINE_TYPE="e2-micro" # Free Tier eligible
VM_NAME="aura-interview-platform"
DISK_SIZE="30GB" # Free Tier persistent disk limit
DISK_TYPE="pd-standard"

# Print banner
echo "=================================================="
echo "      AuraInterview - GCP Free Tier Deployer      "
echo "=================================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed. Please install it and log in first."
    exit 1
fi

# Verify active project
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$ACTIVE_PROJECT" ]; then
    echo "Error: No active GCP project configured. Please run 'gcloud config set project <PROJECT_ID>'."
    exit 1
fi

echo "Deploying to active GCP Project: $ACTIVE_PROJECT"
echo "Region: $REGION | Zone: $ZONE"
echo "Machine: $MACHINE_TYPE | Disk: $DISK_SIZE ($DISK_TYPE)"

# Get Gemini API key
if [ -z "$GEMINI_API_KEY" ]; then
    # Try to load from local .env if it exists
    if [ -f .env ]; then
        GEMINI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d '=' -f2)
    fi
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo -n "Please enter your GEMINI_API_KEY: "
    read -r GEMINI_API_KEY
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "Error: GEMINI_API_KEY is required."
    exit 1
fi

# Enable necessary APIs
echo "Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com

# Create Firewall Rules if they don't exist
echo "Setting up network firewall rules..."
# Allow ports 5173 (frontend) and 8000 (backend)
if ! gcloud compute firewall-rules describe allow-aura-ports &>/dev/null; then
    gcloud compute firewall-rules create allow-aura-ports \
        --allow="tcp:5173,tcp:8000" \
        --target-tags=aura-server \
        --description="Allow AuraInterview Frontend (5173) and Backend API (8000)"
else
    echo "Firewall rule 'allow-aura-ports' already exists."
fi

# Create GCE instance
echo "Creating GCE VM Instance ($VM_NAME)..."
if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
    gcloud compute instances create "$VM_NAME" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family="debian-11" \
        --image-project="debian-cloud" \
        --boot-disk-size="$DISK_SIZE" \
        --boot-disk-type="$DISK_TYPE" \
        --tags=aura-server,http-server,https-server \
        --metadata=startup-script="apt-get update && apt-get install -y git ufw"
else
    echo "VM instance '$VM_NAME' already exists."
fi

# Fetch GCE Instance External IP
echo "Waiting for instance to initialize and fetch external IP..."
sleep 10
EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

if [ -z "$EXTERNAL_IP" ]; then
    echo "Error: Could not retrieve GCE instance external IP."
    exit 1
fi

echo "=================================================="
echo "GCE VM Ready!"
echo "IP Address: $EXTERNAL_IP"
echo "=================================================="

# Create archive of project code to transfer (exclude node_modules, virtual envs, git, and local databases)
echo "Packaging project files..."
ARCHIVE_NAME="aura_deploy.tar.gz"
tar --exclude="node_modules" \
    --exclude="frontend/node_modules" \
    --exclude="backend/__pycache__" \
    --exclude="backend/.pytest_cache" \
    --exclude="backend/ai_interview.db" \
    --exclude="*.db" \
    --exclude=".git" \
    --exclude=".agents" \
    --exclude="venv" \
    --exclude=".env" \
    -czf "$ARCHIVE_NAME" .

# Transfer code archive to GCE instance
echo "Uploading files to GCE VM..."
# Try to retry SCP in case SSH daemon is still initializing on the VM
MAX_RETRIES=5
RETRY_COUNT=0
until gcloud compute scp "$ARCHIVE_NAME" "$VM_NAME":~/ --zone="$ZONE" --quiet; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "Error: Failed to upload project files via SCP after $MAX_RETRIES attempts."
        rm -f "$ARCHIVE_NAME"
        exit 1
    fi
    echo "SSH not ready yet. Retrying file upload in 10 seconds ($RETRY_COUNT/$MAX_RETRIES)..."
    sleep 10
done

# Clean up local archive
rm -f "$ARCHIVE_NAME"

# Run setup commands on GCE VM
echo "Setting up application and Docker on remote VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --quiet --command="
    set -e
    echo '=== Installing Docker and Docker Compose ==='
    if ! command -v docker &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl gnupg lsb-release
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \$(lsb_release -cs) stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        # Symlink compose-plugin to docker-compose
        sudo ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    fi

    echo '=== Extracting project files ==='
    rm -rf aura-interview
    mkdir aura-interview
    tar -xzf $ARCHIVE_NAME -C aura-interview/
    rm -f $ARCHIVE_NAME

    cd aura-interview

    echo '=== Creating production .env file ==='
    cat << EOF > .env
GEMINI_API_KEY=$GEMINI_API_KEY
VITE_API_URL=http://$EXTERNAL_IP:8000
EOF

    echo '=== Launching containers via Docker Compose ==='
    sudo docker-compose down || true
    sudo docker-compose up -d --build

    echo '=== Verification ==='
    sudo docker ps
"

echo "=================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "Frontend URL: http://$EXTERNAL_IP:5173"
echo "Backend API:  http://$EXTERNAL_IP:8000"
echo "=================================================="
