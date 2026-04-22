# Deployment Guide

This dashboard is a **static web app** — it's plain HTML/CSS/JavaScript after building, with no server-side code. That makes hosting simple and cheap (or free).

This guide covers four realistic deployment paths, from easiest to most controlled:

1. [Netlify](#option-1-netlify-drag-and-drop) — drag-and-drop, free tier, public URL
2. [Vercel](#option-2-vercel-git-integrated) — Git-integrated, free tier, public URL
3. [Azure Static Web Apps](#option-3-azure-static-web-apps-microsoft-shops) — if your org is on Microsoft 365/Azure
4. [Internal IIS / Nginx / Apache](#option-4-internal-iis--nginx--apache-on-prem) — for on-premise hosting behind your firewall

---

## Prerequisite: Build the app

Before any hosting path, you need to produce the `dist/` folder:

```bash
npm install
npm run build
```

You now have a `dist/` folder containing `index.html`, JS, CSS, and assets. This is what gets uploaded to the web server.

---

## Option 1: Netlify (drag-and-drop)

**Best for:** Fastest possible deployment, no Git knowledge needed, free for small teams.

**Effort:** 5 minutes.

**URL you'll get:** `https://your-name.netlify.app` (customizable).

### Steps
1. Create a free account at [netlify.com](https://www.netlify.com).
2. After logging in, go to **Sites** in the dashboard.
3. Drag the **`dist/`** folder onto the browser window (where it says "Drag and drop your site output folder here").
4. Wait ~30 seconds — your site is live.
5. Click **Site settings → Change site name** to pick a URL like `halton-endo-scheduling.netlify.app`.

### Redeploying after code changes
Run `npm run build` again, then drag the new `dist/` folder to the same site dashboard. Netlify replaces the old files.

### Adding password protection
On Netlify's Pro plan ($19/mo), you can enable password protection or SSO under **Site settings → Access control**. Without Pro, the URL is public — anyone with the link can access it.

---

## Option 2: Vercel (Git-integrated)

**Best for:** Teams already using GitHub/GitLab who want automatic deploys whenever the code is updated.

**Effort:** 15 minutes.

**URL you'll get:** `https://your-project.vercel.app` (customizable).

### Steps
1. Push this project to a GitHub repository (private if concerned about privacy).
2. Create a free account at [vercel.com](https://vercel.com), signing in with GitHub.
3. Click **Add New... → Project**, then select your repo.
4. Vercel auto-detects the Vite configuration. Click **Deploy**.
5. Every `git push` to the main branch triggers a new deploy automatically.

### Custom domain
Under **Project settings → Domains**, point your organization's subdomain (e.g. `scheduling.yourclinic.com`) at the Vercel project. Vercel handles HTTPS automatically.

### Password protection
Vercel's **Password Protection** is available on the Pro plan. Without it, the URL is publicly accessible.

---

## Option 3: Azure Static Web Apps (Microsoft shops)

**Best for:** Organizations already using Microsoft 365, Azure AD, or Entra ID. Offers easy integration with company SSO for login-required access.

**Effort:** 30–60 minutes if Azure is new; 15 minutes if you've used it before.

**URL you'll get:** `https://your-app.azurestaticapps.net` or a custom domain.

### Steps
1. In the Azure Portal, create a new **Static Web App** resource.
2. Connect it to your GitHub/Azure DevOps repo containing this project.
3. For build settings, use:
   - **App location:** `/`
   - **Output location:** `dist`
4. Azure creates a GitHub Action that builds and deploys on every push.
5. To require login: go to **Authentication** settings and enable Azure AD / Entra ID sign-in. Configure which users or groups are allowed.

### Cost
The **Free** tier covers most small-team scheduling use cases (100 GB bandwidth/month, 2 custom domains). The **Standard** tier ($9/mo) adds SLA and private endpoints.

### Why this is a strong choice for healthcare
- All traffic stays in your Azure tenant
- Native integration with Azure AD/Entra for restricting access to specific clinic staff
- Meets most internal IT security policies for healthcare organizations
- Audit logs via Azure Monitor if needed for compliance

---

## Option 4: Internal IIS / Nginx / Apache (on-prem)

**Best for:** Organizations that require everything to stay behind the firewall; common for hospitals and clinics with strict IT policies.

**Effort:** 30 minutes if your IT team has an existing web server; a few hours if setting one up from scratch.

**URL you'll get:** An internal URL like `https://scheduling.yourclinic.local` accessible only on the clinic network or VPN.

### Generic steps (any server)
1. Run `npm run build` to generate the `dist/` folder.
2. Copy the **contents** of `dist/` (not the folder itself — just the files inside) to your web server's document root.
3. Configure the server to serve `index.html` for any unknown path (single-page app fallback). Examples below.

### IIS (Windows Server)
1. Open **IIS Manager**, create a new site pointing to the folder where you copied the `dist/` contents.
2. Install the **URL Rewrite** module if not already present.
3. Create a `web.config` file in the same folder with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
  </system.webServer>
</configuration>
```

4. Bind HTTPS certificate (internal CA or self-signed with trusted root).
5. For access control, enable **Windows Authentication** in IIS — users already logged into the Windows domain authenticate automatically.

### Nginx (Linux)
Add a server block in `/etc/nginx/sites-available/scheduling`:

```nginx
server {
    listen 80;
    server_name scheduling.yourclinic.local;
    root /var/www/scheduling;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # optional: basic auth for minimal protection
    # auth_basic "Restricted";
    # auth_basic_user_file /etc/nginx/.htpasswd;
}
```

Enable with `sudo ln -s /etc/nginx/sites-available/scheduling /etc/nginx/sites-enabled/ && sudo nginx -s reload`.

### Apache (Linux or Windows)
Create a `.htaccess` file in the `dist/` contents folder:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## Comparing the options

| Option | Cost | Setup time | Access control | Best for |
|---|---|---|---|---|
| **Netlify** | Free | 5 min | Paid plan only | Quick pilot, public OK |
| **Vercel** | Free | 15 min | Paid plan only | Git-driven teams |
| **Azure SWA** | Free / $9 | 30–60 min | Built-in (Entra) | MS-shop with SSO needs |
| **On-prem (IIS/Nginx)** | Existing infra | 30+ min | Domain auth | Strictest IT policies |

---

## Upgrade path: multi-supervisor real-time sync

Once the dashboard is validated and multiple supervisors need to work on the same schedules simultaneously, you'll want a real backend. The recommended next step:

### Minimum viable backend
- **Database:** Azure SQL, Postgres on any cloud, or your on-prem SQL Server
- **API:** A small Node.js/Express or .NET Web API with endpoints like `GET /schedule/:week/:location`, `PUT /schedule/:week/:location`, `GET /staff`, etc.
- **Auth:** Reuse your existing SSO (Entra/AD, Okta)
- **Frontend change:** Replace the `storageGet` and `storageSet` functions in `src/App.jsx` with `fetch()` calls to your API

### Real-time updates (optional but nice)
Add WebSockets or Server-Sent Events so when one supervisor changes an assignment, others see it update live.

### Estimated effort
- Backend MVP: 1–2 weeks for an experienced developer
- Auth integration: 3–5 days depending on your SSO
- Real-time layer: 3–5 days
- Testing and hardening: 1 week

Total: roughly **4–6 weeks** to go from the current local-storage version to a fully shared, authenticated, real-time system.

---

## Troubleshooting

### "npm install" fails
- Make sure you have Node.js 18 or newer: `node --version`
- Try deleting `node_modules/` and `package-lock.json`, then run `npm install` again
- If behind a corporate proxy, configure npm: `npm config set proxy http://your-proxy:8080`

### Build succeeds but page is blank when hosted
- This usually means the site is looking for files at the wrong path
- In `vite.config.js`, make sure `base: "./"` is set (it is by default in this project)
- If deploying to a subpath like `https://example.com/scheduling/`, change `base: "/scheduling/"`

### Excel export button does nothing
- Your browser may be blocking the download
- Check the browser's download bar or permissions for the site
- Try a different browser (Chrome and Edge work reliably; Safari sometimes has quirks)

### Data disappeared
- Did someone clear browser cache/cookies?
- Try a different browser — localStorage is per-browser
- Always restore from the latest JSON backup

---

## Questions?

For questions about this dashboard, contact whoever maintains this project at your organization.
