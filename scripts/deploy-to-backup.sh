#!/bin/bash
# Deploy current code to backup Static Web App
# This triggers the backup workflow manually

echo "Deploying to backup Static Web App..."
echo ""

# Option 1: Create a backup tag (triggers workflow)
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
TAG_NAME="backup-$TIMESTAMP"

echo "Creating tag: $TAG_NAME"
git tag $TAG_NAME
git push origin $TAG_NAME

echo ""
echo "Backup deployment triggered!"
echo "Check status at: https://github.com/AzharM82/industry-runners/actions"
echo ""
echo "Or manually trigger at:"
echo "GitHub → Actions → 'Azure Static Web Apps CI/CD (Backup)' → Run workflow"
