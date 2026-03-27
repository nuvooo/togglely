#!/bin/bash
# Togglely MongoDB Backup Script
# Usage: ./scripts/backup.sh [output-dir]
# Requires: mongodump (MongoDB Database Tools)

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="togglely_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Database connection from env or defaults
DATABASE_URL="${DATABASE_URL:-mongodb://togglely:togglely_secret@localhost:27017/togglely?authSource=admin}"

echo "=== Togglely Backup ==="
echo "Timestamp: ${TIMESTAMP}"
echo "Output: ${BACKUP_PATH}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run mongodump
echo "Running mongodump..."
mongodump --uri="${DATABASE_URL}" --out="${BACKUP_PATH}" --quiet

# Compress backup
echo "Compressing..."
tar -czf "${BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}" "${BACKUP_NAME}"
rm -rf "${BACKUP_PATH}"

BACKUP_SIZE=$(du -h "${BACKUP_PATH}.tar.gz" | cut -f1)
echo "Backup created: ${BACKUP_PATH}.tar.gz (${BACKUP_SIZE})"

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "togglely_backup_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "togglely_backup_*.tar.gz" | wc -l)
echo "Total backups: ${BACKUP_COUNT}"
echo "=== Backup complete ==="
