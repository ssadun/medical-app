# Medical App

A personal medical records tracker built for self-hosting on a Synology NAS. Tracks lab test results, appointments, and patient info — with trend charts, PDF import, and per-test insights.

---

## File Structure

```
medical-app/
├── server.js                  ← Node/Express backend
├── package.json
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js        ← PM2 config (alternative to Docker)
├── service.sh                 ← Start/stop helper script
├── data/
│   ├── medical_results.json       ← your data (gitignored)
│   └── medical_results_sample.json  ← sample data (used when real file is missing)
└── public/
    ├── index.html             ← redirects to dashboard
    ├── dashboard.html
    ├── test.html              ← test results table
    ├── trend.html             ← trend chart for a single test
    ├── insights.html          ← per-test notes/explanations
    ├── add-test.html
    ├── import.html            ← PDF import
    ├── import-csv-test.html
    ├── appointments.html
    ├── add-appoinment.html
    ├── schedule.html
    ├── patient.html
    ├── add-patient.html
    ├── navigation.json        ← nav structure (shared across all pages)
    ├── shared.js              ← shared utilities, auth, nav rendering
    ├── style.css
    └── js/                    ← per-page scripts
        ├── dashboard.js
        ├── test.js
        ├── trend.js
        ├── insights.js
        ├── add-test.js
        ├── import.js
        ├── import-csv-test.js
        ├── appointments.js
        ├── add-appoinment.js
        ├── schedule.js
        ├── patient.js
        ├── add-patient.js
        └── import-csv-appoinment.js
```

---

## Features

- **Dashboard** — summary metrics and recent out-of-range records
- **Test Results** — searchable, filterable, sortable table with pagination
- **Trend Chart** — time-series chart for any test item with a data table below
- **Insights** — rich-text notes per test (meaning, high/low explanations)
- **Add / Delete Records** — manual entry with autocomplete for test and facility names
- **PDF Import** — auto-parses Turkish lab report PDFs, lets you review before saving
- **Appointments** — list, add, and delete appointments
- **Patient Info** — name, DOB, height, weight, blood type, BMI with category theming
- **Authentication** — session-based login, PBKDF2-hashed password, 4-hour session TTL
- **Data** — stored as JSON; real file is gitignored, sample file ships with the repo

---

## API Endpoints

All endpoints (except `/api/auth/login`) require an active session cookie.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Log in |
| `GET` | `/api/auth/me` | Check current session |
| `POST` | `/api/auth/logout` | Log out |
| `GET` | `/api/data` | Get all records, appointments, catalog, insights |
| `GET` | `/api/meta` | Get summary metadata |
| `POST` | `/api/kayit` | Add a single test record |
| `POST` | `/api/kayitlar` | Bulk add test records (used by PDF import) |
| `PUT` | `/api/kayit/:id` | Update a test record |
| `DELETE` | `/api/kayit/:id` | Delete a test record |
| `GET` | `/api/appointments` | List appointments |
| `POST` | `/api/appointments` | Add an appointment |
| `DELETE` | `/api/appointments/:id` | Delete an appointment |
| `GET` | `/api/patient` | Get patient info |
| `PUT` | `/api/patient` | Update patient info |
| `GET` | `/api/test-insights` | Get all test insights |
| `PUT` | `/api/test-insight` | Save insight for a test |
| `POST` | `/api/import-pdf` | Upload and parse a PDF lab report |

---

## Installation on Synology NAS

### Option A — Docker

**1. Copy files to NAS**
```bash
scp -r medical-app/ admin@NAS_IP:/volume1/system/
```
Or use File Station.

**2. Install Container Manager**
DSM → Package Center → **Container Manager** → Install

**3. Start the container**
```bash
ssh admin@NAS_IP
cd /volume1/system/medical-app
sudo docker-compose up -d --build
```

**4. Open in browser**
```
http://NAS_IP:3234
```

### Option B — PM2 (no Docker)

```bash
cd /volume1/system/medical-app
npm install
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

---

## Remote Access

**Tailscale (recommended)**
1. Synology Package Center → Tailscale → Install & sign in
2. Install Tailscale on your phone/laptop
3. Access via Tailscale IP: `http://100.x.x.x:3234`

**Synology QuickConnect + Reverse Proxy**
1. DSM → Control Panel → QuickConnect → Enable
2. DSM → Control Panel → Application Portal → Reverse Proxy
   - Source: `https://medical.yourid.quickconnect.to`
   - Destination: `http://localhost:3234`

---

## Authentication

Default credentials are set via environment variables. To change the password:

1. Generate a new salt and hash:
```bash
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(32).toString('hex');
const hash = crypto.pbkdf2Sync('YOUR_NEW_PASSWORD', Buffer.from(salt,'hex'), 100000, 64, 'sha512').toString('hex');
console.log('AUTH_PASSWORD_SALT=' + salt);
console.log('AUTH_PASSWORD_HASH=' + hash);
"
```
2. Set them as environment variables in `docker-compose.yml` or your PM2/shell environment:
```yaml
environment:
  - AUTH_USERNAME=admin
  - AUTH_PASSWORD_SALT=...
  - AUTH_PASSWORD_HASH=...
```

---

## Updating

```bash
cd /volume1/system/medical-app
git pull
sudo docker-compose up -d --build   # Docker
# or
pm2 restart medical-app             # PM2
```

---

## Data Backup

Back up `data/medical_results.json` — that file contains all your records, appointments, and patient info. The sample file (`medical_results_sample.json`) is used automatically when the real file doesn't exist.
