# AEON IT Team Tracker

IT Team daily attendance log, weekly PPP (Progress/Plans/Problems) status reports, and revisable monthly objectives.

## Architecture

```
aeon_ittracker/
├── it-team-tracker-backend/   # Node.js/Express API + PostgreSQL
│   ├── src/
│   │   ├── index.js           # Express server, auto-migration
│   │   ├── db.js              # PostgreSQL connection pool
│   │   ├── schema.sql         # Database schema + seed data
│   │   └── routes/
│   │       ├── records.js     # Daily attendance CRUD
│   │       ├── objectives.js  # Monthly objectives CRUD
│   │       └── weekly.js      # Weekly PPP CRUD
│   └── package.json
├── it-team-tracker-web/       # Static file server for frontend
│   ├── server.js              # Express static server
│   ├── public/
│   │   └── index.html         # Single-page frontend app
│   └── package.json
└── README.md
```

## Deployment (Zeabur)

Both services are deployed on Zeabur (HKG region) under the **IT-Team-Tracker** project:

| Service | URL |
|---------|-----|
| Backend API | https://adg-it-tracker-api.zeabur.app |
| Frontend | https://adg-it-tracker.zeabur.app |
| PostgreSQL | Managed by Zeabur (internal) |

## Database

PostgreSQL with 4 tables:
- **users** — team members and PINs
- **daily_records** — daily attendance/work logs
- **weekly_ppp** — weekly Progress/Plans/Problems reports
- **objectives** — monthly objectives per member

Schema auto-migrates on backend startup via `schema.sql`.

## Team Members

Jimmy, James, Riot, Terry, Timothy (members) + Philip (reviewer)

## Environment Variables (Backend)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` or `POSTGRES_CONNECTION_STRING` | PostgreSQL connection string |
| `CORS_ORIGINS` | Allowed origins (`*` for all) |
| `PORT` | Server port (default: 3000) |
| `PGSSLMODE` | Set to `require` to enable SSL |
