# StockPro AI - Backup & Disaster Recovery

## Overview

This document outlines the backup strategy for StockPro AI to ensure data safety and quick recovery.

## Components to Backup

| Component | Location | Backup Method |
|-----------|----------|---------------|
| Source Code | GitHub | Mirror to backup repo |
| PostgreSQL Database | Azure | Automatic + Manual exports |
| Redis Cache | Azure | Persistence enabled |
| Static Web App | Azure | Redeploy from GitHub |

---

## 1. Code Backup

### Primary Repository
- **URL**: https://github.com/AzharM82/industry-runners
- **Branch**: master

### Backup Repository
- **URL**: https://github.com/AzharM82/stockproai-backup (create this)
- **Sync Command**: `git push backup master`

### Setup Backup Remote
```bash
git remote add backup https://github.com/AzharM82/stockproai-backup.git
git push backup master
```

### Sync After Each Deployment
```bash
git push origin master && git push backup master
```

---

## 2. PostgreSQL Database Backup

### Azure Automatic Backups (Enabled by Default)
- **Retention**: 7 days (Azure minimum)
- **Type**: Full daily + transaction log backups
- **Geo-Redundant**: Enable in Azure Portal

### Point-in-Time Restore (Azure Portal)
1. Go to Azure Portal → Your PostgreSQL Server
2. Click "Restore"
3. Select restore point (any time within retention period)
4. Creates new server with restored data

### Manual Backup (Run Weekly)
```bash
# Set your database password
export DB_PASSWORD="your-password"

# Run backup script
./scripts/backup-database.sh
```

### Restore from Manual Backup
```bash
export DB_PASSWORD="your-password"
./scripts/restore-database.sh ./backups/stockproai_backup_YYYYMMDD_HHMMSS.sql
```

---

## 3. Redis Cache Backup

### Enable Persistence in Azure Portal
1. Go to Azure Portal → Your Redis Cache
2. Settings → Data persistence
3. Enable RDB persistence (snapshots)
4. Set backup frequency: Every 1 hour

### Export Redis Data Manually
```bash
# Via Azure CLI
az redis export --name your-redis-name --resource-group your-rg \
  --prefix stockproai --container your-storage-container
```

---

## 4. Full Disaster Recovery

### Scenario: Complete System Failure

**Recovery Steps:**

1. **Restore Code**
   ```bash
   git clone https://github.com/AzharM82/stockproai-backup.git
   ```

2. **Restore Database**
   - Azure Portal → PostgreSQL → Restore to point-in-time
   - OR use manual backup: `./scripts/restore-database.sh <backup-file>`

3. **Restore Redis**
   - Azure Portal → Redis → Import data from storage

4. **Redeploy Static Web App**
   - Push to GitHub triggers automatic deployment
   - OR manually deploy via Azure Portal

### Scenario: Accidental Data Deletion

1. Use Azure Point-in-Time Restore (within 7 days)
2. Select time BEFORE the deletion occurred
3. Restore to new database server
4. Update DATABASE_URL in Azure Static Web App settings

---

## 5. Backup Schedule

| Task | Frequency | Method |
|------|-----------|--------|
| Code sync to backup repo | After each deploy | Manual: `git push backup master` |
| Database auto-backup | Daily | Azure automatic |
| Database manual export | Weekly | Run `backup-database.sh` |
| Redis snapshot | Hourly | Azure automatic (if enabled) |
| Test restore | Monthly | Restore to test environment |

---

## 6. Cost Estimate (Monthly)

| Service | Cost |
|---------|------|
| Azure PostgreSQL (with geo-backup) | ~$25-50 |
| Azure Redis (Basic with persistence) | ~$15-25 |
| Azure Static Web App (Free tier) | $0 |
| Storage for backups | ~$1-5 |
| **Total** | **~$40-80/month** |

---

## 7. Important Contacts & URLs

- **Production App**: https://www.stockproai.net
- **GitHub Repo**: https://github.com/AzharM82/industry-runners
- **Azure Portal**: https://portal.azure.com
- **Admin Dashboard**: https://www.stockproai.net/admin

---

## 8. Emergency Contacts

- **Primary Admin**: reachazure37@gmail.com
- **Secondary Admin**: reachazhar@hotmail.com

---

*Last Updated: January 2026*
