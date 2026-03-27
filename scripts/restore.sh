#!/bin/bash
# Togglely MongoDB Restore Script
# Usage: ./scripts/restore.sh <backup-file.tar.gz>
# Requires: mongorestore (MongoDB Database Tools)

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo "Available backups:"
  ls -lh backups/togglely_backup_*.tar.gz 2>/dev/null || echo "  No backups found in ./backups/"
  exit 1
fi

BACKUP_FILE="$1"
DATABASE_URL="${DATABASE_URL:-mongodb://togglely:togglely_secret@localhost:27017/togglely?authSource=admin}"
TEMP_DIR=$(mktemp -d)

echo "=== Togglely Restore ==="
echo "Backup: ${BACKUP_FILE}"
echo ""
echo "WARNING: This will overwrite the current database!"
read -p "Continue? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# Extract backup
echo "Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted directory
RESTORE_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name "togglely_backup_*" | head -1)

if [ -z "${RESTORE_DIR}" ]; then
  echo "Error: No backup data found in archive"
  rm -rf "${TEMP_DIR}"
  exit 1
fi

# Run mongorestore
echo "Running mongorestore..."
mongorestore --uri="${DATABASE_URL}" --drop "${RESTORE_DIR}" --quiet

# Cleanup
rm -rf "${TEMP_DIR}"

echo "=== Restore complete ==="
