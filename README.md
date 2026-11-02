# AEON IT Team Tracker

IT Team daily attendance log, weekly PPP (Progress/Plans/Problems) status reports, and revisable monthly objectives.

## Architecture (v2 — Docker unified)

Single Express service serves both the API and the frontend. No CORS needed.

```
aeon_ittracker/
├── src/
│   ├── index.js           # Express: API routes + static file server
│   ├── db.js              # PostgreSQL connection pool
│   ├── schema.sql         # Database schema + seed data
│   └── routes/
│       ├── records.js     # Daily attendance CRUD
│       ├── objectives.js  # Monthly objectives CRUD
│       └── weekly.js      # Weekly PPP CRUD
├── public/
│   └── index.html         # Single-page frontend app
├── Dockerfile
├── docker-compose.yml     # App + PostgreSQL for local dev / VPS
├── package.json
└── README.md
```

### Legacy (archived)

The `it-team-tracker-backend/` and `it-team-tracker-web/` directories contain the previous two-service architecture deployed on Zeabur.

## Quick start with Docker

```bash
# Clone and run
git clone https://github.com/terryyangaeon/aeon_ittracker.git
cd aeon_ittracker
docker compose up -d

# Open http://localhost:3000
```

This starts two containers:
- **app** — Node.js Express (port 3000)
- **db** — PostgreSQL 16 (port 5432)

The database schema auto-migrates on first startup.

## Deploy to a VPS

```bash
# On your VPS
git clone https://github.com/terryyangaeon/aeon_ittracker.git
cd aeon_ittracker

# Create .env from example
cp .env.example .env
# Edit .env if you want custom DB credentials

docker compose up -d
```

To use an external PostgreSQL (e.g., managed database), set `DATABASE_URL` in `.env` and remove the `db` service from `docker-compose.yml`.

## Standalone HTML Version

`IT-Team-Tracker-v4.html` is a single-file version that runs entirely in the browser with localStorage. Open it directly — no installation needed.

## Database

PostgreSQL with 4 tables:
- **users** — team members and PINs
- **daily_records** — daily attendance/work logs
- **weekly_ppp** — weekly Progress/Plans/Problems reports
- **objectives** — monthly objectives per member

Schema auto-migrates on startup via `schema.sql`.

## Team Members

Jimmy, James, Riot, Terry, Timothy (members) + Philip (reviewer)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` or `POSTGRES_CONNECTION_STRING` | PostgreSQL connection string |
| `PORT` | Server port (default: 3000) |
| `PGSSLMODE` | Set to `require` to enable SSL |

## Current Deployment (Zeabur)

| Service | URL |
|---------|-----|
| Frontend + API | https://adg-it-tracker.zeabur.app |
| PostgreSQL | Managed by Zeabur (internal) |
