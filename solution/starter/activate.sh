#!/bin/bash

# Activate script for CymbalFlix development environment
# Sets environment variables needed for Gemini CLI and application

echo "🎬 Activating CymbalFlix environment..."

# Get current GCP project
export PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

# Set Firestore environment variables for Gemini CLI
export FIRESTORE_PROJECT=$PROJECT_ID
export FIRESTORE_DATABASE=cymbalflix-db

# Get Firestore host from gcloud (if database exists)
FIRESTORE_UID=$(gcloud firestore databases describe --database=$FIRESTORE_DATABASE --format="value(uid)" 2>/dev/null)
FIRESTORE_REGION=$(gcloud firestore databases describe --database=$FIRESTORE_DATABASE --format="value(locationId)" 2>/dev/null)

if [ ! -z "$FIRESTORE_UID" ] && [ ! -z "$FIRESTORE_REGION" ]; then
    export FIRESTORE_HOST="${FIRESTORE_UID}.${FIRESTORE_REGION}.firestore.goog"
fi

# Display current configuration
echo ""
echo "Environment configured:"
echo "  Project ID:        $PROJECT_ID"
echo "  Firestore Project: $FIRESTORE_PROJECT"
echo "  Firestore DB:      $FIRESTORE_DATABASE"
if [ ! -z "$FIRESTORE_HOST" ]; then
    echo "  Firestore Host:    $FIRESTORE_HOST"
fi
echo ""
echo "✅ Ready to use Gemini CLI and run the application!"
