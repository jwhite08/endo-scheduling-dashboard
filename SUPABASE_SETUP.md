# Supabase Setup Guide

This walks through connecting the dashboard to a Supabase backend so multiple supervisors can share the same data in real time. **Total time: ~25 minutes.**

## What you'll set up

1. A free Supabase project (cloud-hosted Postgres database)
2. Database tables, security rules, and realtime publication
3. Supervisor user accounts (manually created)
4. Two environment variables in Netlify so the dashboard can connect

---

## Step 1 — Create the Supabase project (5 min)

1. Go to [supabase.com](https://supabase.com) and sign up. Free tier, no credit card.
2. Click **New project**.
3. Pick:
   - **Project name:** `endo-scheduling` (or anything you like)
   - **Database password:** generate a strong one and save it somewhere safe — you'll rarely need it but losing it is a hassle
   - **Region:** pick closest to your supervisors. For Charlotte, NC use `East US (North Virginia)`
   - **Pricing plan:** Free
4. Click **Create new project** and wait ~2 minutes for it to provision.

## Step 2 — Run the database setup script (2 min)

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/setup.sql` from this project, copy the entire contents, and paste into the SQL editor.
4. Click **Run** (bottom right).
5. You should see "Success. No rows returned." That created three tables (`staff`, `rules`, `schedules`), security policies, and the realtime publication.

## Step 3 — Disable email signups (1 min)

We want only manually-created accounts, not anyone-can-sign-up.

1. Click **Authentication** in the left sidebar, then **Sign In / Up** (or **Providers**).
2. Find the **Email** provider section.
3. Find the **Allow new users to sign up** toggle and turn it **off**.
4. Save changes.

> Note: If you don't see this exact toggle, you can also go to Authentication → Settings and look for "Enable signups". Different Supabase versions label it slightly differently.

## Step 4 — Create supervisor accounts (3 min)

1. In Supabase, go to **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. For each supervisor, enter their email + a temporary password. Check the **Auto Confirm User** box so they don't need to verify by email.
4. Send each supervisor their email + temp password securely (in person, encrypted message — not plain email if possible).
5. Tell them to change their password after first sign-in. (Currently the dashboard doesn't expose a password change UI; if they want a new one, they'd have to ask you to reset it in Supabase. We can add a "change password" feature later if needed.)

## Step 5 — Get your project credentials (1 min)

1. In Supabase, go to **Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon public** key — under "Project API keys", a long JWT string starting with `eyJ...`

These two values are safe to put in your frontend code. The "anon" key only allows operations that pass your RLS policies (which require sign-in), so it's not actually a secret.

## Step 6 — Configure Netlify (5 min)

1. Go to your Netlify site dashboard → **Site configuration** → **Environment variables**.
2. Click **Add a variable** and add these two:
   - Key: `VITE_SUPABASE_URL` &nbsp;&nbsp; Value: your Project URL from Step 5
   - Key: `VITE_SUPABASE_ANON_KEY` &nbsp;&nbsp; Value: your anon public key from Step 5
3. Save.
4. Trigger a redeploy: **Deploys** tab → **Trigger deploy** → **Deploy site**.

The next deploy bakes the env vars into the JavaScript bundle. (Vite reads `VITE_*` vars at build time, not runtime — so any change to them requires a rebuild.)

## Step 7 — Verify it works (3 min)

1. Visit your live Netlify URL.
2. You should see the **Sign in** screen.
3. Sign in with one of the supervisor emails you created in Step 4.
4. The dashboard should load with the example schedule (May 4 Halton).
5. Make a small edit (change a name in a cell). Watch the **Sync indicator** in the header turn from "Saving" → "Saved".
6. Open the same URL in a different browser (or incognito window) and sign in as a different supervisor.
7. Make an edit on one screen. Within ~1 second the other screen should show the change.

If realtime sync works, you're done.

---

## For local development (optional)

If you want to run `npm run dev` locally and have it connect to your Supabase project, create a `.env.local` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxx...
```

Don't commit this file — it's already in `.gitignore`.

---

## Troubleshooting

### "Cloud sync not configured" screen
The env vars aren't set. Check Netlify's Environment variables and trigger a fresh deploy.

### Sign-in fails with "Invalid login credentials"
- Triple-check the email and password in Supabase → Authentication → Users
- Make sure the user has a green "Confirmed" badge — if not, click them and check Auto Confirm

### Sign-in succeeds but dashboard shows "Connection failed"
The most common cause is the SQL setup script didn't fully run. Re-run `supabase/setup.sql` in the SQL Editor — it's safe to run multiple times.

### Realtime updates aren't appearing
- Confirm Step 2 ran successfully (the tables should be in the `supabase_realtime` publication)
- Some corporate networks block WebSockets, which Supabase uses for realtime. The dashboard will still work — saves go through, but other supervisors won't see updates until they refresh

### Free tier limits
The free Supabase tier gives you:
- 500 MB database storage (you'll use ~5–10 MB even after a year)
- 5 GB bandwidth/month
- 2 active projects
- Up to 50,000 monthly active users

You won't hit any of these. If you ever do, the Pro tier is $25/month.

---

## Backup strategy

Even with cloud sync, **export a JSON backup weekly** (using the Backup button in the dashboard header) and save it to OneDrive/SharePoint. This protects you against:
- Accidental deletion (someone clicks Clear Week + confirm)
- Bad imports (someone uploads a corrupt JSON)
- Supabase outages (rare but possible)

The Backup button downloads a JSON file with everything. If something goes wrong, click Import to restore.

Supabase also has automatic daily backups on the Pro tier ($25/mo) — worth it if this becomes mission-critical.
