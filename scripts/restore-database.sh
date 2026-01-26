#!/bin/bash
# Database Restore Script for StockPro AI
# USE WITH CAUTION - This will overwrite existing data!

# Configuration - UPDATE THESE VALUES
DB_HOST="your-server.postgres.database.azure.com"
DB_NAME="your-database-name"
DB_USER="your-username"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: ./restore-database.sh <backup_file>"
    echo ""
    echo "Available backups:"
    ls -la ./backups/
    exit 1
fi

BACKUP_FILE=$1

# Confirm restore
echo "WARNING: This will restore database from: $BACKUP_FILE"
echo "This will OVERWRITE all current data!"
read -p "Are you sure? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Restore backup
echo "Restoring from: $BACKUP_FILE"
PGPASSWORD=$DB_PASSWORD pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -c $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "Restore successful!"
else
    echo "Restore failed!"
    exit 1
fi
