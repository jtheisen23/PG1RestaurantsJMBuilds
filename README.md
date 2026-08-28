# Development Pipeline Dashboard

A multi-user, real-time dashboard for tracking Jersey Mikes development
projects through Real Estate → Pre-Construction → Construction/Ops,
plus a shared contacts list and a 12-week construction playbook.

- **Frontend:** React + Vite
- **Backend:** Firebase (Authentication + Firestore)
- **Hosting:** Firebase Hosting (deploys straight from this repo)

Everyone signs in with their own account. Roles control what they can do:

| Role   | Can view | Can edit projects/contacts/checklists | Can delete projects | Can manage roles |
|--------|:---:|:---:|:---:|:---:|
| viewer | ✅ | ❌ | ❌ | ❌ |
| editor | ✅ | ✅ | ❌ | ❌ |
| admin  | ✅ | ✅ | ✅ | ✅ |

New sign-ins default to **viewer** until an admin promotes them from the
in-app "Team" tab.

---

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a new project
   (or use an existing one).
2. **Authentication:** Build → Authentication → Get started → enable the
   **Email/Password** sign-in provider.
3. **Firestore:** Build → Firestore Database → Create database → start in
   **production mode** (the security rules in this repo take care of
   access control) → pick a region close to your team.
4. **Web app:** Project settings (gear icon) → General → "Your apps" →
   click the `</>` (web) icon → register an app (no need for Firebase
   Hosting setup in the wizard, we'll do that via CLI). Copy the
   `firebaseConfig` values shown — you'll need them in step 3 below.

## 2. Create your first admin account

1. Authentication → Users → **Add user** → enter your own email and a
   password.
2. You'll promote this account to `admin` in step 5, after the app is
   running and has created your user profile document.

## 3. Configure the app

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in the config values from step 1.4:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`.env.local` is gitignored — it never gets committed.

## 4. Run it locally

```bash
npm run dev
```

Open the printed localhost URL and sign in with the account you created
in step 2. You'll land on an empty dashboard (no projects yet) — that's
expected, data comes in the next step.

## 5. Make yourself an admin

The first time you sign in, the app automatically creates a `users/{uid}`
document for you with `role: "viewer"`. To upgrade yourself to admin
before the in-app Team tab is usable:

1. Firestore Database → `users` collection → find the document with your
   email → edit the `role` field → change `"viewer"` to `"admin"`.
2. Refresh the app. You'll now see a **Team** tab where you can promote
   everyone else from there on.

## 6. Load the starting data (optional, one-time)

This repo includes the 43 projects, 12 contacts, and 35 construction
tasks pulled from the original spreadsheet, in `scripts/seed-*.json`.
To load them into Firestore:

1. Project settings → Service accounts → **Generate new private key** →
   save the downloaded file as `scripts/serviceAccountKey.json` (this is
   gitignored — never commit it).
2. `npm install firebase-admin --save-dev`
3. `node scripts/seed.js`

This only needs to run once. If you skip it, you can also just use
"+ Add Project" / "+ Add Contact" in the app to start from scratch.

## 7. Deploy

```bash
npm install -g firebase-tools   # if you don't have it
firebase login
cp .firebaserc.example .firebaserc   # then edit it with your project id
firebase deploy
```

This deploys both the Firestore security rules (`firestore.rules`) and
the built app (`hosting`). Firebase will print a URL like
`https://your-project.web.app` — that's what you share with your team.

Whenever you make code changes: `npm run build && firebase deploy`.

## 8. Add your employees

For each employee:

1. Authentication → Users → **Add user** with their email + a temporary
   password (or send them a password-reset link from that same screen so
   they set their own).
2. Have them sign in once at your deployed URL — this creates their
   profile automatically as a viewer.
3. Go to the **Team** tab (admin only) and change their role to `editor`
   (or leave as `viewer` for read-only access, or `admin` if they should
   also manage roles).

There's no public sign-up page by design — only people you've explicitly
added in the Firebase console can log in.

---

## Optional: daily email digest

A GitHub Actions workflow can email a summary of each day's completed
checklist items to a distribution list. It needs no Cloud Function and no
Blaze plan. Setup is in [docs/DAILY-DIGEST.md](docs/DAILY-DIGEST.md).

---

## Project structure

```
src/
  firebase.js              Firebase app initialization
  context/AuthContext.jsx  Auth state + role lookup
  lib/firestore.js         All Firestore reads/writes (realtime hooks)
  lib/helpers.js           Phase/progress calculations shared by components
  data/headers.json        The ~200 checklist field definitions (static)
  components/              UI: TopBar, Overview, ProjectDetail, Contacts,
                            ConstructionPlaybook, AdminPanel
  pages/Login.jsx          Sign-in screen
firestore.rules            Server-enforced role permissions
scripts/seed.js            One-time data import script
scripts/backfill-order.js  Syncs project order + completed flags from JSON
scripts/daily-digest.js    Emails the daily activity summary
scripts/remove-placeholder-projects.js
                           Deletes the imported spreadsheet divider rows
.github/workflows/         Scheduled digest job
```

## How data is structured in Firestore

- `projects/{id}` — `{ brand, name, fields: { <column letter>: value }, updatedAt, updatedBy }`.
  `fields` mirrors the original spreadsheet's ~200 checklist/data columns
  (see `src/data/headers.json` for labels and which phase each belongs to).
- `contacts/{id}` — `{ category, company, contact_name, contact, notes }`
- `timeline/{id}` — the shared 12-week construction playbook template:
  `{ week, detail, who, order }`
- `constructionProgress/{projectId}` — one doc per project, `{ <taskId>: true/false }`
- `users/{uid}` — `{ email, name, role }`

## Notes on the permission model

- Security is enforced **server-side** by `firestore.rules`, not just in
  the UI — a viewer can't write data even by calling Firestore directly.
- Every project edit stamps `updatedBy`/`updatedAt`, shown in the app as
  "Last edited by ___" so you have a lightweight audit trail. For a full
  change history (every edit, not just the latest), you'd add a
  Cloud Function that writes each change to an `activity` collection —
  ask if you want that added.
