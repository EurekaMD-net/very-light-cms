#!/usr/bin/env bash
set -euo pipefail

DEST=/root/backups/vlcms
STAMP=$(date +%F)
mkdir -p "$DEST"

cd /root/claude/very-light-cms

# SQLite hot backup (online-safe, doesn't block writers)
sqlite3 data/cms.db ".backup '$DEST/cms-$STAMP.db'"

# Journal repo (content + uploads). Git is the primary backup, this is belt-and-suspenders.
if [[ -d /root/claude/thewilliamsradar-journal ]]; then
  tar czf "$DEST/journal-$STAMP.tgz" -C /root/claude thewilliamsradar-journal
fi

# Retain 14 days
find "$DEST" -type f -mtime +14 -delete

echo "[backup] ok $STAMP -> $DEST"
