# Daily activity digest

Emails a summary of each day's completed checklist items to a distribution
list. Runs on GitHub Actions, so it needs no Cloud Function and no Firebase
Blaze plan — the free tier covers it.

Days with no activity send no email, so quiet weekends stay silent.

---

## What you need

Two things, both set up in a browser:

1. A **Gmail app password** (or any SMTP mailbox) to send from.
2. Your **Firebase service account key** — the same `serviceAccountKey.json`
   you downloaded for the seed script.

---

## 1. Create a Gmail app password

An app password is a 16-character code that lets a script send mail from your
account without using your real password. Gmail requires 2-Step Verification
before it will issue one.

1. Go to <https://myaccount.google.com/security>
2. Turn on **2-Step Verification** if it isn't already.
3. Go to <https://myaccount.google.com/apppasswords>
4. Name it something like `PG1 Digest` and click **Create**.
5. Copy the 16-character code. Google shows it once.

Treat this like a password — it can send mail as you. If it ever leaks, delete
it from that same page and make a new one.

> Sending from a shared mailbox instead of a personal one is worth considering,
> so the digest doesn't appear to come from you personally.

---

## 2. Add the repository secrets

Go to the repository on github.com → **Settings** → **Secrets and variables**
→ **Actions** → **New repository secret**. Add these five:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The entire contents of `scripts/serviceAccountKey.json`, pasted in — braces and all |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_USER` | The Gmail address sending the digest |
| `SMTP_PASS` | The 16-character app password from step 1 |
| `DIGEST_TO` | Who receives it. Comma-separated for several: `a@x.com, b@x.com` |

Secrets are write-only — GitHub will never display them again, and they don't
appear in workflow logs.

### Optional settings

Same page, **Variables** tab. All have working defaults, so skip this unless
you want to change something.

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_PORT` | `465` | Mail server port |
| `DIGEST_FROM` | same as `SMTP_USER` | From address |
| `DIGEST_TZ` | `America/New_York` | Which timezone decides where a day starts and ends |
| `DIGEST_APP_URL` | the hosted dashboard | Link in the email footer |

---

## 3. Test it before trusting it

On github.com: **Actions** tab → **Daily activity digest** → **Run workflow**.

Start with a preview that sends nothing:

- **Which day to report:** `1`
- **Preview only:** ✅ checked

Click **Run workflow**, then open the run and read the log. You'll see the
window it queried, how many entries it found, and the plain-text email it
would have sent.

If that looks right, run it again with **Preview only** unchecked. The email
should arrive within a minute.

> If the day you picked had no activity, the log says so and stops without
> sending. Try `--days-ago=0` for today, or tick a checkbox in the dashboard
> first so there's something to report.

---

## 4. Leave it running

Once the manual test works, the schedule takes over. No further action.

It runs at **11:00 UTC every day** — 7am Eastern in summer, 6am in winter.
GitHub's scheduler has no timezone support, so the send time shifts by an hour
across daylight saving. The *contents* stay correct either way: the script
works out day boundaries in `DIGEST_TZ`, independently of when it runs.

To change the time, edit the `cron` line in
`.github/workflows/daily-digest.yml`. The five fields are
`minute hour day-of-month month day-of-week`, always in UTC.

---

## Running it locally

Useful for testing changes to the email itself.

```bash
# preview yesterday, send nothing (needs scripts/serviceAccountKey.json)
npm run digest:dry

# today so far
node scripts/daily-digest.js --dry-run --days-ago=0

# actually send
DIGEST_TO=you@example.com SMTP_HOST=smtp.gmail.com \
SMTP_USER=you@gmail.com SMTP_PASS=your-app-password \
npm run digest
```

Locally the script reads `scripts/serviceAccountKey.json`; in Actions it reads
the `FIREBASE_SERVICE_ACCOUNT` secret. Either works.

---

## Troubleshooting

**"Cannot send. Missing: …"** — a secret isn't set, or is named differently.
Check spelling on the Actions secrets page.

**"Invalid login" / authentication failure** — the app password is wrong, or
you used your normal Google password. Regenerate it and re-paste, no spaces.

**"FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON"** — the paste was
truncated. It must be the whole file, starting `{` and ending `}`.

**The email never arrives but the log says "Sent"** — check spam. Mail from a
personal Gmail to a distribution list often lands there the first time; mark it
"not spam" once and it'll behave.

**Nothing runs on schedule** — GitHub disables scheduled workflows in
repositories with no activity for 60 days. Push a commit, or run it manually,
to re-enable.

---

## What it costs

Nothing. GitHub Actions is free for public repositories, and private ones get a
monthly allowance this uses a tiny fraction of — one run is well under a minute.
Reading a day of activity from Firestore is a handful of document reads against
a 50,000/day free quota.
