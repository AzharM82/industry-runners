#!/bin/bash
# Database Backup Script for StockPro AI
# Run manually or schedule via cron/Azure Automation

# Configuration - UPDATE THESE VALUES
DB_HOST="your-server.postgres.database.azure.com"
DB_NAME="your-database-name"
DB_USER="your-username"
BACKUP_DIR="./backups"
RETENTION_DAYS=3

# Create backup directory
mkdir -p $BACKUP_DIR

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/stockproai_backup_$TIMESTAMP.sql"

# Create backup
echo "Creating backup: $BACKUP_FILE"
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f $BACKUP_FILE

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup successful: $BACKUP_FILE"

    # Delete backups older than RETENTION_DAYS
    echo "Cleaning up backups older than $RETENTION_DAYS days..."
    find $BACKUP_DIR -name "stockproai_backup_*.sql" -mtime +$RETENTION_DAYS -delete

    echo "Backup complete!"
else
    echo "Backup failed!"
    exit 1
fi

# List current backups
echo ""
echo "Current backups:"
ls -la $BACKUP_DIR
