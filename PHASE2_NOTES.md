# Phase 2 — Time-Off, Smart Auto-Fill, and All Sites View

## What's new

### 1. Time-off tracking on the Staff tab
Each staff row now has a **Time Off** column showing whether they're currently out (amber "Out today" badge) or have any periods recorded. Click the badge to open a popover where you can:
- Add a date range with optional reason
- See all of their existing periods
- Delete any range

Time-off entries sync in real-time across all signed-in supervisors.

### 2. Auto-fill Rotations is now time-off-aware
The existing **Auto-fill Rotations** button works exactly as before, with one important behavior change: when a person in the rotation is marked off on a given day, that day's slot is left blank for the supervisor to assign coverage. The rotation itself still cycles correctly — when the person returns, they re-enter the cycle in the right position.

The toast confirms which path was taken:
- "Rotations auto-filled based on Monday's roster" — nobody was out
- "Rotations filled — out-of-office days left blank for coverage" — at least one slot was skipped

### 3. New "All Sites" tab
A weekly day-strip view showing all 4 locations stacked vertically with M–F columns. Each cell shows compressed assignments grouped by section. Use this to:
- Spot a floater scheduled at two locations on the same day (highlighted amber)
- See anyone scheduled while marked off (highlighted rose with strikethrough)
- Click any cell to jump to that location's full editor

This is read-only — meant for at-a-glance verification, not editing.

### 4. Validation panel now flags scheduled-but-off
If you put someone on the schedule who's marked off that day, you get a warning. As with all the other warnings, it's advisory — you can still keep the assignment if it's intentional.

### 5. Date-drift bug fix (carryover)
The previous bug where weeks could show wrong day labels when navigating forward is fixed. Mondays are correctly Mondays.

## Files changed in this update

```
package.json                       - no dependency changes (same as cloud-update)
src/App.jsx                        - new features + date fix
src/supabase.js                    - time-off CRUD + realtime
supabase/setup_phase2.sql          - NEW migration script
PHASE2_NOTES.md                    - this file
```

## Deployment steps

### Step 1 — Run the new SQL migration

In your Supabase dashboard:
1. Click **SQL Editor** → **New query**
2. Open `supabase/setup_phase2.sql` from this update, copy the entire contents
3. Paste into the editor and click **Run**
4. You should see "Success. No rows returned."

This is **safe to re-run** — uses `CREATE TABLE IF NOT EXISTS` everywhere.

### Step 2 — Replace the changed code files in your local git repo

Copy from this update zip into your existing project folder:
- `src/App.jsx` → replaces existing
- `src/supabase.js` → replaces existing
- `supabase/setup_phase2.sql` → new file
- `PHASE2_NOTES.md` → new file (optional, just for your reference)

### Step 3 — Push and deploy

```powershell
cd C:\path\to\endo-scheduling-dashboard
git add .
git commit -m "Phase 2: time-off tracking, time-off-aware auto-fill, All Sites view"
git push
```

Netlify auto-deploys in ~2 minutes.

### Step 4 — Verify

After deploy, sign in and confirm:

- **Staff tab** — Time Off column appears, click the "Mark" badge on any row → popover opens
- **Add a test time-off entry** for a staff member for tomorrow → the badge updates to show count
- **Schedule view** — that staff member should appear at the bottom of the dropdown for that specific day labeled "(off)"
- **Auto-fill Rotations** — if a staff member in the rotation is off, their day is left blank
- **All Sites tab** — opens in the top nav, shows all 4 locations stacked
- **Multi-user sync** — open the dashboard in two browsers, add a time-off in one, see it appear in the other within ~1 second

If anything breaks, send me the error and I'll fix it.

## Known limitations & future ideas

- **Recurring time-off** isn't supported (e.g., "every Friday for 8 weeks"). Would need to enter each range separately. We can add recurrence patterns in a later phase if it becomes painful.
- **Time-off granularity is full-day only**. No "out from 1pm–5pm" support yet.
- **No half-day or partial-day** indicator — the supervisor would still need to add a note in the Training/Time Off section of the schedule for nuance.
- **All Sites view doesn't allow editing.** Click into a cell to jump to the full editor instead. We could add inline edit later if it's a common request.
- **The Auto-fill behavior on coverage** is to leave the day blank — it doesn't pick a substitute automatically. Auto-substituting would require additional rules (who covers whom?) and we agreed to keep auto-fill predictable for now.

## What I'd suggest next

After your team has used Phase 2 for a week or so, the natural next features are:

1. **Smart Auto-builder for procedure rooms** — the deferred half of last phase's plan. A separate "Fill home rooms" button that uses Room Owners + skips out-staff to populate procedure room assignments in one click.
2. **Audit log view** — the data is already being captured (`updated_by`/`updated_at` on every table); we just need a UI to browse it.
3. **Per-location permissions** — restrict editing rights to home-location supervisors while keeping read access for everyone (matches your team's specialization-with-visibility model).
4. **CSV import for time-off** from your HR system — once you confirm what your HR export format looks like.

Don't pick yet — let your team use Phase 2 for a real scheduling cycle and see what they ask for.
