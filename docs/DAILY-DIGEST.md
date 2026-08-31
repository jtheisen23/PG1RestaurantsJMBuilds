# Daily activity digest

Emails a summary of the previous day's completed checklist items to a
distribution list, overnight, so it is waiting first thing in the morning. Runs on GitHub Actions, so it needs no
Cloud Function and no Firebase Blaze plan — the free tier covers it.

Days with no activity send no email, so quiet weekends stay silent.

---

## What you need

Two things, both set up in a browser:

1. A **mailbox to send from**, with an app password — ideally a Google
   Workspace address on `pg1restaurants.com`.
2. Your **Firebase service account key** — the same `serviceAccountKey.json`
   you downloaded for the seed script.

The recipient, `development@pg1restaurants.com`, needs nothing set up beyond
being willing to accept the mail (step 3).

---

## 1. Pick the sending mailbox

The digest goes **to** `development@pg1restaurants.com`, the Google Group.
The group itself needs no password — it only receives.

What needs credentials is the mailbox the digest is sent **from**, because the
script has to authenticate somewhere in order to send.

Use a Google Workspace address on `pg1restaurants.com`, not a personal Gmail:

- the digest arrives from the company domain rather than someone's personal
  account
- a Google Group that only accepts internal mail will accept it without extra
  configuration
- it survives any one person leaving

A dedicated mailbox such as `noreply@pg1restaurants.com` is ideal. Your own
Workspace address works too.

## 2. Create an app password for it

An app password is a 16-character code that lets a script send mail without
using the real account password. 2-Step Verification must be on first.

1. Sign in as the sending account.
2. <https://myaccount.google.com/security> — turn on **2-Step Verification**.
3. <https://myaccount.google.com/apppasswords>
4. Name it `PG1 Digest`, click **Create**, copy the 16-character code.

Google shows it once. Treat it like a password — it can send mail as that
account. If it leaks, delete it from that page and generate another.

> **If that page won't load or says app passwords aren't available**, your
> Workspace administrator has disabled them. That's a common policy. Options,
> in order of ease:
>
> 1. Ask the admin to allow app passwords for that one account.
> 2. Use the **Workspace SMTP relay** (`smtp-relay.gmail.com`), which an admin
>    configures to accept mail from your project without per-user credentials.
>    Admin console → Apps → Google Workspace → Gmail → Routing → SMTP relay
>    service. Then set `SMTP_HOST` to `smtp-relay.gmail.com` and `SMTP_PORT`
>    to `587`.
> 3. Use a transactional email provider (Resend, SendGrid, Postmark) with
>    `pg1restaurants.com` verified. Free tiers cover this volume easily.
>
> All three end up as the same four SMTP settings below.

## 3. Let the group accept the mail

A Google Group can be configured to reject mail from outside its membership.
If the digest bounces, this is why.

Google Groups → `development@pg1restaurants.com` → **Settings** → **Posting
policies** → **Who can post**. Either:

- add the sending address as a member of the group, or
- set posting to allow anyone in the organization

Sending from a `pg1restaurants.com` address usually satisfies this already.

---

## 4. Add the repository secrets

Go to the repository on github.com → **Settings** → **Secrets and variables**
→ **Actions** → **New repository secret**. Add these five:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The entire contents of `scripts/serviceAccountKey.json`, pasted in — braces and all |
| `SMTP_HOST` | `smtp.gmail.com` (or `smtp-relay.gmail.com` for the Workspace relay) |
| `SMTP_USER` | The Workspace address sending the digest |
| `SMTP_PASS` | The 16-character app password from step 2 |
| `DIGEST_TO` | `development@pg1restaurants.com`. Comma-separated if you ever want more |

Secrets are write-only — GitHub will never display them again, and they don't
appear in workflow logs.

### Optional settings

Same page, **Variables** tab. All have working defaults, so skip this unless
you want to change something.

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_PORT` | `465` | Mail server port. Use `587` for the Workspace SMTP relay |
| `DIGEST_FROM` | same as `SMTP_USER` | From address |
| `DIGEST_TZ` | `America/New_York` | Which timezone decides where a day starts and ends |
| `DIGEST_ROLLOVER_HOUR` | `8` | Only when reporting today: before this local hour, "today" means the day that just ended |
| `DIGEST_APP_URL` | the hosted dashboard | Link in the email footer |

---

## 5. Test it before trusting it

On github.com: **Actions** tab → **Daily activity digest** → **Run workflow**.

Start with a preview that sends nothing:

- **Which day to report:** `1` (yesterday — the default, and what the schedule reports)
- **Preview only:** ✅ checked

Click **Run workflow**, then open the run and read the log. You'll see the
window it queried, how many entries it found, and the plain-text email it
would have sent.

If that looks right, run it again with **Preview only** unchecked. The email
should arrive within a minute.

> If the day you picked had no activity, the log says so and stops without
> sending. Use `0` for today so far, or tick a checkbox in the dashboard first
> so there's something to report. Higher numbers reach further back: `2` is the
> day before yesterday, and so on.

---

## 6. Leave it running

Once the manual test works, the schedule takes over. No further action.

It is scheduled for **05:17 UTC every day** — 1:17am Eastern in summer,
12:17am in winter — and reports the **previous** day.

**GitHub does not run it on time.** Against an earlier schedule, observed
starts were roughly six hours late, every day. This is normal for GitHub's
shared scheduler and cannot be made punctual.

The schedule is set early on purpose. A 1am start delayed by six hours arrives
around 7am; scheduled for 8am instead, the same delay would have pushed it into
the afternoon.

| | Fires (ET) | With a 6-hour delay |
|---|---|---|
| Summer (EDT) | 1:17am | ~7:17am |
| Winter (EST) | 12:17am | ~6:17am |

Reporting the previous day is what makes the delay harmless: every hour after
midnight has the same unambiguous "yesterday", so any start time from just past
midnight through the following evening sends the correct day. This is why the
schedule is no longer a same-evening digest — that one, delayed past midnight,
asked for a brand-new empty "today", found nothing, and silently dropped three
days of activity.

`DIGEST_ROLLOVER_HOUR` (default 8) still exists but **only applies when
reporting today** (`days_ago = 0`), where the same-day hazard is real. It is
deliberately not applied when reporting yesterday — doing so would report two
days back whenever the run lands before 8am local, which is exactly what
happens in winter.

The log prints the run time, the day being reported, and whether the rollover
applied.

To change the time, edit the `cron` line in
`.github/workflows/daily-digest.yml`. The five fields are
`minute hour day-of-month month day-of-week`, always in UTC. Eastern is UTC-4
in summer and UTC-5 in winter, so 1am ET is `17 5 * * *` and 8am ET would be
`17 12 * * *`. Bear GitHub's multi-hour delay in mind: the cron sets the
earliest possible time, not the arrival time. Keep a same-day digest well clear
of midnight, or leave it reporting yesterday, which has no such constraint.

---

## Running it locally

Useful for testing changes to the email itself.

```bash
# preview yesterday, send nothing (needs scripts/serviceAccountKey.json)
npm run digest:dry

# today so far instead
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

**The email never arrives but the log says "Sent"** — two likely causes.
Check spam first; mail to a group often lands there once, and marking it "not
spam" fixes it for good. If it isn't there, the group rejected it — see step 3
about posting policies. A rejection usually bounces back to the sending
mailbox, so check that inbox for a delivery failure notice naming the reason.

**Nothing runs on schedule** — GitHub disables scheduled workflows in
repositories with no activity for 60 days. Push a commit, or run it manually,
to re-enable.

---

## What it costs

Nothing. GitHub Actions is free for public repositories, and private ones get a
monthly allowance this uses a tiny fraction of — one run is well under a minute.
Reading a day of activity from Firestore is a handful of document reads against
a 50,000/day free quota.
