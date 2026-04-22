# Endoscopy Scheduling Dashboard

A web-based scheduling tool for endoscopy supervisors covering four locations: Halton (GEC), Augusta (GEC), Clemson (CEC), and Spartanburg (SEC).

## What it does

- **Schedule builder** with a spreadsheet-style grid matching your current Excel layout
- **Staff roster** with role (Tech / RN / FD), primary location, and eligible locations
- **Rules engine** for room owners and rotation orders per location
- **Auto-fill rotations** — applies the daily-advance pattern (Monday's last person becomes Tuesday's first)
- **Copy previous week** forward to preserve patterns across weeks
- **Conflict warnings** — flags double-booking across locations, role mismatches, and ineligible assignments
- **Export to Excel** — generates an `.xlsx` in the same format as your original template
- **JSON backup/import** — share schedules between supervisors as files until a shared database is added

## Quick start (run locally)

### Prerequisites
- **Node.js 18 or newer** — download from [nodejs.org](https://nodejs.org) (the LTS version is fine)

### Steps
```bash
# 1. Install dependencies (one-time, takes 1-2 minutes)
npm install

# 2. Start the dev server
npm run dev
```

The dashboard opens automatically at `http://localhost:5173`. Edit any file in `src/` and changes hot-reload.

### Build for production
```bash
npm run build
```
This produces a `dist/` folder containing static files (HTML, CSS, JS) ready to upload to any web server.

### Preview the production build locally
```bash
npm run preview
```

## Data storage

All data (staff, rules, schedules) is saved in the browser's `localStorage`.

- Data is per-browser and per-computer — it does **not** automatically sync across supervisors
- Use the **Backup** button (top-right) to export all data as a JSON file
- Use the **Import** button to load a JSON file from another supervisor
- If you clear browser cache or use a different browser/device, you lose your local data (but you can reimport a backup)

For multi-supervisor real-time sharing, see the "Upgrade path" section in `DEPLOYMENT.md`.

## Project structure

```
endo-scheduling-dashboard/
├── index.html              # Entry HTML (loads fonts, mounts React)
├── package.json            # Dependencies and scripts
├── vite.config.js          # Build configuration
├── tailwind.config.js      # Tailwind utility classes config
├── postcss.config.js
└── src/
    ├── main.jsx            # React entry point
    ├── App.jsx             # The entire dashboard (all components)
    └── index.css           # Global styles + Tailwind directives
```

Everything is in a single `App.jsx` file (~1900 lines) organized into clearly-marked sections. If your team wants to split components into separate files later, it's a straightforward refactor.

## Customization

### Change locations, sections, or rooms
Edit the `LOC_META` and `buildLocationConfig` sections near the top of `src/App.jsx`.

### Change pre-populated staff
Edit the `INITIAL_STAFF` array in `src/App.jsx`. Note: this only affects first-time users; existing users' data in localStorage will not be overwritten. To reset, they'd use Import with a fresh JSON.

### Change color/font theme
- Fonts are loaded in `index.html` and configured in `tailwind.config.js`
- Brand colors are used inline via Tailwind classes; search for `bg-slate-900`, `text-teal-700`, etc. to adjust

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for hosting options including Netlify, Vercel, Azure Static Web Apps, internal IIS, and Nginx.

## Backup recommendations

Supervisors should click **Backup** at least weekly to save a JSON snapshot, especially before:
- Clearing browser cache
- Switching computers
- Major changes to the staff roster or rules

Store backups somewhere durable (shared drive, SharePoint, OneDrive).

## Healthcare / PHI considerations

Staff names alone are generally not considered PHI under HIPAA, but local institutional policy may be stricter. Recommendations:

- **For internal use only**: Host on an internal/intranet server, not public cloud
- **If using public hosting**: Ensure the URL is behind SSO or at minimum password-protected
- **Never** paste patient identifiers into the notes/training field — it's designed for scheduling context only

## Upgrade path (future)

To move from "per-browser storage" to "shared real-time state across supervisors," the next version would add:
- A small backend API (Node/Express, .NET, or Python FastAPI)
- A database (Postgres, SQL Server, or similar)
- Authentication so only authorized supervisors can edit
- Optionally, audit logging for compliance

The current front-end is structured so adding a REST API requires replacing only the `storageGet` / `storageSet` helpers with `fetch()` calls — an estimated 1–2 weeks of work depending on auth requirements.

## License / ownership

This is a custom-built internal tool for your organization. Modify freely.
