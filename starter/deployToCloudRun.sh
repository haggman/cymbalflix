#!/bin/bash

# CymbalFlix Cloud Run Deployment Script
# This script deploys the application to Google Cloud Run

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}CymbalFlix Cloud Run Deployment${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create a .env file based on .env.example"
    exit 1
fi

# Load environment variables from .env
echo -e "${YELLOW}Loading configuration from .env...${NC}"
export $(grep -v '^#' .env | xargs)

# Validate required variables
if [ -z "$FIRESTORE_HOST" ]; then
    echo -e "${RED}Error: FIRESTORE_HOST not set in .env${NC}"
    exit 1
fi

if [ -z "$FIRESTORE_DATABASE" ]; then
    echo -e "${RED}Error: FIRESTORE_DATABASE not set in .env${NC}"
    exit 1
fi

# Get current project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No GCP project configured${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

# Set default region (can be overridden)
REGION=${REGION:-us-east4}
SERVICE_ACCOUNT="cymbalflix-run-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo -e "\n${YELLOW}Configuration:${NC}"
echo "  Project ID:        $PROJECT_ID"
echo "  Region:            $REGION"
echo "  Service Account:   $SERVICE_ACCOUNT"
echo "  Firestore Host:    $FIRESTORE_HOST"
echo "  Firestore DB:      $FIRESTORE_DATABASE"

# Confirm deployment
echo -e "\n${YELLOW}Ready to deploy to Cloud Run.${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Deploy to Cloud Run
echo -e "\n${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy cymbalflix \
  --source . \
  --region "$REGION" \
  --service-account="$SERVICE_ACCOUNT" \
  --set-env-vars="FIRESTORE_HOST=$FIRESTORE_HOST,FIRESTORE_DATABASE=$FIRESTORE_DATABASE,PROJECT_ID=$PROJECT_ID" \
  --allow-unauthenticated \
  --platform managed \
  --max-instances 10

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment successful!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe cymbalflix --region "$REGION" --format 'value(status.url)')
    echo -e "Your application is now running at:"
    echo -e "${GREEN}$SERVICE_URL${NC}\n"
else
    echo -e "\n${RED}Deployment failed. Please check the errors above.${NC}"
    exit 1
fi