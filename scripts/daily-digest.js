/**
 * Emails a daily digest of activity-log entries to a distribution list.
 *
 * Reads the `activity` collection for one calendar day, groups the entries by
 * project, and sends a summary. Run on a schedule by
 * .github/workflows/daily-digest.yml, so no Cloud Function and no Blaze plan
 * is needed.
 *
 * Usage:
 *   node scripts/daily-digest.js --dry-run     print the email, send nothing
 *   node scripts/daily-digest.js               send it
 *   node scripts/daily-digest.js --days-ago=1  yesterday (default is 0, today)
 *
 * Configuration, all via environment variables:
 *   DIGEST_TO                 recipients, comma-separated (required to send)
 *   DIGEST_FROM               From address (defaults to SMTP_USER)
 *   DIGEST_TZ                 timezone deciding where a day starts and ends
 *                             (default America/New_York)
 *   DIGEST_SEND_EMPTY         "true" to email even on days with no activity;
 *                             otherwise those days are skipped silently
 *   DIGEST_APP_URL            dashboard link in the footer
 *   SMTP_HOST, SMTP_PORT      mail server (port 465 implies TLS)
 *   SMTP_USER, SMTP_PASS      mail credentials
 *   FIREBASE_SERVICE_ACCOUNT  service account JSON as a string; falls back to
 *                             scripts/serviceAccountKey.json for local runs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const daysAgoArg = process.argv.find((a) => a.startsWith('--days-ago='));
const DAYS_AGO = daysAgoArg ? Number(daysAgoArg.split('=')[1]) : 0;
const TZ = process.env.DIGEST_TZ || 'America/New_York';
const APP_URL = process.env.DIGEST_APP_URL || 'https://pg1-jm-builds.web.app';

if (!Number.isInteger(DAYS_AGO) || DAYS_AGO < 0) {
  console.error('--days-ago must be a non-negative whole number.');
  process.exit(1);
}

// ---------- timezone-aware day boundaries ----------
// GitHub Actions runs in UTC, but "yesterday" has to mean yesterday where the
// team works, or a digest sent at 7am ET would cover the wrong window and
// shift by an hour twice a year when daylight saving changes.

function partsInTz(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Intl can report midnight as hour 24 in some environments.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

function offsetMs(date, timeZone) {
  const p = partsInTz(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant at which the given local calendar date begins.
function startOfLocalDay(year, month, day, timeZone) {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);
  let instant = naive;
  // Two passes settles the offset even when the guess lands on the far side of
  // a daylight-saving transition.
  for (let i = 0; i < 2; i++) {
    instant = naive - offsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

function addDays(year, month, day, delta) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const todayLocal = partsInTz(new Date(), TZ);
const target = addDays(todayLocal.year, todayLocal.month, todayLocal.day, -DAYS_AGO);
const next = addDays(target.year, target.month, target.day, 1);
const windowStart = startOfLocalDay(target.year, target.month, target.day, TZ);
const windowEnd = startOfLocalDay(next.year, next.month, next.day, TZ);

const dayHeading = new Date(Date.UTC(target.year, target.month - 1, target.day)).toLocaleDateString(
  'en-US',
  { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
);

// ---------- credentials ----------
function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch {
      console.error('FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON.');
      process.exit(1);
    }
  }
  try {
    return JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
  } catch {
    console.error(
      '\nNo credentials. Set FIREBASE_SERVICE_ACCOUNT, or place a key at scripts/serviceAccountKey.json for local runs.\n'
    );
    process.exit(1);
  }
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

// ---------- formatting ----------
const escapeHtml = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const timeIn = (date) =>
  date.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

function summarise(entries, nameById) {
  const byProject = new Map();
  const byPerson = new Map();
  entries.forEach((e) => {
    const key = e.projectName || nameById.get(e.projectId) || 'Unknown project';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(e);
    if (e.done) byPerson.set(e.by, (byPerson.get(e.by) || 0) + 1);
  });
  const projects = [...byProject.entries()].sort((a, b) => b[1].length - a[1].length);
  const people = [...byPerson.entries()].sort((a, b) => b[1] - a[1]);
  return { projects, people };
}

function buildText({ projects, people }, completed, reopened) {
  const lines = [`PG1 Pipeline - ${dayHeading}`, ''];
  lines.push(`${completed} item${completed === 1 ? '' : 's'} completed across ${projects.length} project${projects.length === 1 ? '' : 's'}.`);
  if (reopened) lines.push(`${reopened} item${reopened === 1 ? '' : 's'} reopened.`);
  if (people.length) {
    lines.push('', people.map(([who, n]) => `${who}: ${n}`).join('  |  '));
  }
  projects.forEach(([name, items]) => {
    lines.push('', name.toUpperCase(), '-'.repeat(name.length));
    items.forEach((e) => {
      lines.push(
        `  ${e.done ? '[x]' : '[ ]'} ${e.item}${e.phase ? ` (${e.phase})` : ''} - ${e.by}, ${timeIn(e.date)}`
      );
    });
  });
  lines.push('', APP_URL);
  return lines.join('\n');
}

function buildHtml({ projects, people }, completed, reopened) {
  const chip = (label, value) =>
    `<td style="padding:0 22px 0 0;"><div style="font:700 24px/1 Helvetica,Arial,sans-serif;color:#125e9b;">${value}</div>
     <div style="font:600 11px/1.4 Helvetica,Arial,sans-serif;color:#5c6672;text-transform:uppercase;letter-spacing:.07em;padding-top:4px;">${label}</div></td>`;

  const projectBlocks = projects
    .map(
      ([name, items]) => `
    <tr><td style="padding:22px 0 6px;">
      <div style="font:700 16px/1.3 Helvetica,Arial,sans-serif;color:#14181d;">${escapeHtml(name)}</div>
    </td></tr>
    ${items
      .map(
        (e) => `<tr><td style="padding:6px 0;border-top:1px solid #e3e7ec;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td width="20" valign="top" style="font:700 13px/1.5 Helvetica,Arial,sans-serif;color:${e.done ? '#125e9b' : '#8a939e'};">${e.done ? '&#10003;' : '&#8634;'}</td>
          <td valign="top" style="font:400 14px/1.45 Helvetica,Arial,sans-serif;color:${e.done ? '#14181d' : '#5c6672'};">
            ${escapeHtml(e.item)}
            <div style="font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#5c6672;padding-top:2px;">
              ${escapeHtml(e.phase || '')}${e.phase ? ' &middot; ' : ''}${escapeHtml(e.by)} &middot; ${timeIn(e.date)}
            </div>
          </td>
        </tr></table>
      </td></tr>`
      )
      .join('')}`
    )
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f8;padding:24px 12px;">
   <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e3e7ec;border-radius:12px;">
      <tr><td style="padding:26px 28px 0;border-top:3px solid #1878c4;border-radius:12px 12px 0 0;">
        <div style="font:800 22px/1 Helvetica,Arial,sans-serif;color:#14181d;">PG<span style="color:#1878c4;">1</span> <span style="font-weight:400;color:#5c6672;">Development Pipeline</span></div>
        <div style="font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#5c6672;padding-top:6px;">${dayHeading}</div>
      </td></tr>
      <tr><td style="padding:22px 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${chip('Completed', completed)}
          ${reopened ? chip('Reopened', reopened) : ''}
          ${chip(projects.length === 1 ? 'Project' : 'Projects', projects.length)}
        </tr></table>
      </td></tr>
      ${
        people.length
          ? `<tr><td style="padding:18px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:#5c6672;">
              ${people.map(([who, n]) => `${escapeHtml(who)} <strong style="color:#14181d;">${n}</strong>`).join(' &nbsp;&middot;&nbsp; ')}
             </td></tr>`
          : ''
      }
      <tr><td style="padding:0 28px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${projectBlocks}</table></td></tr>
      <tr><td style="padding:20px 28px 26px;">
        <a href="${escapeHtml(APP_URL)}" style="display:inline-block;background:#1878c4;color:#ffffff;font:600 14px/1 Helvetica,Arial,sans-serif;text-decoration:none;padding:12px 20px;border-radius:8px;">Open the dashboard</a>
      </td></tr>
      <tr><td style="padding:0 28px 24px;font:400 11.5px/1.6 Helvetica,Arial,sans-serif;color:#8a939e;border-top:1px solid #e3e7ec;padding-top:16px;">
        Checklist items ticked or unticked in the last day. Text and date field edits are not included.
      </td></tr>
    </table>
   </td></tr>
  </table></body></html>`;
}

// ---------- main ----------
async function main() {
  console.log(`Window: ${windowStart.toISOString()} -> ${windowEnd.toISOString()} (${TZ})`);

  const snap = await db
    .collection('activity')
    .where('at', '>=', windowStart)
    .where('at', '<', windowEnd)
    .orderBy('at', 'asc')
    .get();

  const entries = snap.docs
    .map((d) => {
      const data = d.data();
      return { ...data, date: data.at?.toDate?.() };
    })
    .filter((e) => e.date);

  const completed = entries.filter((e) => e.done).length;
  const reopened = entries.length - completed;
  console.log(`${entries.length} entries (${completed} completed, ${reopened} reopened).`);

  if (!entries.length && process.env.DIGEST_SEND_EMPTY !== 'true') {
    console.log('Nothing happened on this day. Skipping the email (set DIGEST_SEND_EMPTY=true to send anyway).');
    process.exit(0);
  }

  // Recover names for entries written before empty names fell back to brand.
  const projectSnap = await db.collection('projects').get();
  const nameById = new Map(
    projectSnap.docs.map((d) => [d.id, d.data().name || d.data().brand || ''])
  );

  const grouped = summarise(entries, nameById);
  const subject = entries.length
    ? `PG1 Pipeline - ${completed} item${completed === 1 ? '' : 's'} completed, ${dayHeading}`
    : `PG1 Pipeline - no activity, ${dayHeading}`;
  const text = buildText(grouped, completed, reopened);
  const html = buildHtml(grouped, completed, reopened);

  if (DRY_RUN) {
    console.log(`\n--- subject ---\n${subject}\n\n--- text ---\n${text}\n`);
    console.log(`(HTML body is ${html.length} bytes; nothing sent.)`);
    process.exit(0);
  }

  const to = process.env.DIGEST_TO;
  const missing = ['DIGEST_TO', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Cannot send. Missing: ${missing.join(', ')}. Use --dry-run to preview without sending.`);
    process.exit(1);
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const info = await transport.sendMail({
    from: process.env.DIGEST_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
  console.log(`Sent to ${to} (message id ${info.messageId}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
