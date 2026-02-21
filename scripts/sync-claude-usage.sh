#!/bin/bash
# Sync claude-usage.json from Maldo agent to Mission Control public folder
# Run this after claude usage cron job updates the data

SOURCE="/Users/jeanseda/.openclaw/workspace/agents/maldo/data/claude-usage.json"
DEST="/Users/jeanseda/.openclaw/workspace/mission-control/public/data/claude-usage.json"

if [ -f "$SOURCE" ]; then
  cp "$SOURCE" "$DEST"
  echo "✓ Synced claude-usage.json to Mission Control"
else
  echo "✗ Source file not found: $SOURCE"
  exit 1
fi
