#!/bin/sh
# setup.sh — Run once to install dependencies and register the app with PM2.
# Tested on Synology DSM with Node.js installed from Package Center.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Install app dependencies ──────────────────────────────
echo "[1/4] Installing Node dependencies..."
npm install --production

# ── 2. Install PM2 globally (if not already installed) ───────
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[2/4] Installing PM2..."
  npm install -g pm2
else
  echo "[2/4] PM2 already installed — skipping."
fi

# ── 3. Start / restart app via PM2 ───────────────────────────
echo "[3/4] Starting medical-app with PM2..."
pm2 startOrRestart ecosystem.config.js

# ── 4. Save process list and enable startup on boot ──────────
echo "[4/4] Saving PM2 process list..."
pm2 save

echo ""
echo "Done. App is running at http://localhost:3234"
echo "Default login username: admin"
echo "Default login password: change-me"
echo "Credentials are stored as PBKDF2-SHA512 hash + 32-byte salt in ecosystem.config.js."
echo "To generate a new salt/hash for a new password, run:"
echo "node -e \"const c=require('crypto');const p='NEW_PASSWORD';const s=c.randomBytes(32);const h=c.pbkdf2Sync(p,s,100000,64,'sha512');console.log('AUTH_PASSWORD_SALT='+s.toString('hex'));console.log('AUTH_PASSWORD_HASH='+h.toString('hex'));\""
echo ""
echo "Useful commands:"
echo "  pm2 status               — check if the app is running"
echo "  pm2 logs medical-app     — view live logs"
echo "  pm2 restart medical-app  — restart after code changes"
echo "  pm2 stop medical-app     — stop the app"
echo ""
echo "To auto-start on every NAS reboot, add this to Synology Task Scheduler"
echo "(Control Panel → Task Scheduler → Create → Triggered Task → Boot-up):"
echo ""
echo "  /usr/local/bin/pm2 resurrect"
echo ""
