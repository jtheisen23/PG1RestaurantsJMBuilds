"""
Turns the Acquisition Checklist workbook into the two files the app needs:

  src/data/brands/jm-acquisitions.json     the checklist itself
  scripts/seed-jm-acquisitions-projects.json   the stores, for the importer

The workbook is shaped differently from the brand workbooks: Jersey Mike's
and Dave's are one column per checklist item, where this is one ROW per item
with its own priority, owner and notes. So each row becomes one checklist
item, and the per-row columns become the item's metadata:

  Item                  -> the label
  In-Charge             -> resp, shown after the label like an assignee
  Priority              -> a dropdown, its options taken from the sheet's own
                           data validation rather than from the values used,
                           so an option nobody has picked yet still appears
  Done                  -> the tick-box itself, and what progress counts
  Vendor / Notes /
  How To / SLA /
  Contact / Progress    -> a note under the item

Re-importing a revised workbook is the dangerous case, and the reason this
script reads its own previous output before writing. A ticked item is stored
against its key -- PRE7, POST12 -- so if a new sheet inserts a row near the
top and the keys are handed out by row order again, every key below it slides
onto a different item and every tick with it. Nothing errors; the ticks just
quietly start claiming the wrong things.

So keys are matched to the previous import by phase and item wording and
reused where they match. Genuinely new rows are given fresh keys numbered
past the highest already in use, never a gap left by something deleted.
Items that have gone from the sheet are reported: their stored values stay
in the database, harmless and uncounted, and come back if the item returns.

Usage:  python3 scripts/convert-acquisition-workbook.py <workbook.xlsx>
        python3 scripts/convert-acquisition-workbook.py <workbook.xlsx> --fresh

--fresh ignores the previous import and numbers from one. Only correct for
a first import into an empty database.
"""
import json
import re
import sys
from openpyxl import load_workbook

args = [a for a in sys.argv[1:] if not a.startswith('--')]
FRESH = '--fresh' in sys.argv
SRC = args[0] if args else sys.exit('pass the .xlsx path')
OUT = 'src/data/brands/jm-acquisitions.json'

# Wording is matched after collapsing case and punctuation, so a tidied-up
# apostrophe or a trailing space in the sheet does not read as a new item.
def ident(phase, label):
    return (phase, re.sub(r'[^a-z0-9]', '', (label or '').lower()))

previous = []
if not FRESH:
    try:
        with open(OUT) as f:
            previous = json.load(f)
    except FileNotFoundError:
        previous = []

# A queue of keys per wording, not a single key: the Pre Close sheet has two
# items whose text appears twice, and mapping wording to one key would hand
# the first copy the stored key and invent one for the second -- moving a key
# even when the sheet had not changed at all.
known = {}
used = set()
highest = {}
for h in previous:
    letter = h.get('letter', '')
    m = re.match(r'^(PRE|POST)(\d+)$', letter)
    if not m:
        continue
    known.setdefault(ident(h.get('phase'), h.get('label')), []).append(letter)
    highest[m.group(1)] = max(highest.get(m.group(1), 0), int(m.group(2)))

# The note columns differ between the two sheets; both are "things worth
# knowing while doing this item", so they are joined into one note.
NOTE_COLS = {
    'Pre Close': ['Vendor', 'Notes', 'How To'],
    'Post Close': ['Vendor', 'SLA', 'Contact', 'Progress Notes'],
}
PREFIX = {'Pre Close': 'PRE', 'Post Close': 'POST'}


def clean(v):
    if v is None:
        return ''
    return re.sub(r'\s+', ' ', str(v)).strip()


def options_for(ws, col_letter):
    """The dropdown list Excel itself enforces on a column."""
    for dv in ws.data_validations.dataValidation:
        if dv.type != 'list':
            continue
        if any(str(r).startswith(f'{col_letter}') for r in dv.sqref.ranges):
            raw = (dv.formula1 or '').strip('"')
            seen, out = set(), []
            for o in (x.strip() for x in raw.split(',')):
                if o and o not in seen:
                    seen.add(o)
                    out.append(o)
            return out
    return []


wb = load_workbook(SRC)
wbv = load_workbook(SRC, data_only=True)

headers = []
# Reference data about the store, kept at the top of the Pre Close list.
# 'C' deliberately matches the Jersey Mike's address column, because the
# project list and the search box read the address from C.
headers.append({'col': 2, 'letter': 'B', 'label': 'Phone Number', 'phase': 'Pre Close',
                'resp': None, 'hint': None, 'type': 'text'})
headers.append({'col': 3, 'letter': 'C', 'label': 'Full Address', 'phase': 'Pre Close',
                'resp': None, 'hint': None, 'type': 'text'})

col = 4
report = {}
for sheet in ['Pre Close', 'Post Close']:
    ws, wsv = wb[sheet], wbv[sheet]
    hdr = [clean(c) for c in next(wsv.iter_rows(min_row=2, max_row=2, values_only=True))]
    idx = {h: i for i, h in enumerate(hdr) if h}
    opts = options_for(ws, 'B')
    n = 0
    dues = 0
    reused = 0
    fresh_keys = []
    for row in wsv.iter_rows(min_row=3, values_only=True):
        get = lambda k: clean(row[idx[k]]) if k in idx and idx[k] < len(row) else ''
        item = get('Item')
        if not item:
            continue  # filler rows carrying only Done=False
        n += 1
        if get('Due Date'):
            dues += 1

        pfx = PREFIX[sheet]
        key = ident(sheet, item)
        queue = known.get(key) or []
        letter = queue.pop(0) if queue else None
        if letter:
            reused += 1
        else:
            # Past the highest ever issued, so a key freed by a deleted item
            # is never handed to a different one -- values stored against it
            # would reappear on the newcomer.
            highest[pfx] = highest.get(pfx, 0) + 1
            letter = f'{pfx}{highest[pfx]}'
            fresh_keys.append(item)
        used.add(letter)
        note = ' · '.join(x for x in (get(c) for c in NOTE_COLS[sheet]) if x)
        priority = get('Priority')
        headers.append({
            'col': col,
            'letter': letter,
            'label': item,
            'phase': sheet,
            'resp': get('In-Charge') or None,
            'hint': note or None,
            'type': 'checkbox',
            'options': opts,
            # The sheet's own priority for this item, used until someone
            # changes it on a store. Not every row has one.
            'priority': priority if priority in opts else None,
        })
        col += 1
    gone = [h['label'] for h in previous
            if h.get('phase') == sheet and h.get('letter', '') not in used
            and re.match(r'^(PRE|POST)\d+$', h.get('letter', ''))]
    report[sheet] = {
        'items': n, 'options': opts, 'rows_with_due_date': dues,
        'keys_reused': reused, 'new_items': fresh_keys,
        'items_no_longer_in_the_sheet': gone,
    }

with open('src/data/brands/jm-acquisitions.json', 'w') as f:
    json.dump(headers, f, indent=1)
    f.write('\n')

# --- the stores -------------------------------------------------------
ws = wbv['Stores']
stores = []
for i, row in enumerate(ws.iter_rows(min_row=4, values_only=True)):
    name, phone, addr = clean(row[2]), clean(row[3]), clean(row[4])
    if not name:
        continue
    # Most stores are "6030- Mt Vernon, VA". The few with no store number
    # yet are left as "-Seminole Trail", which reads as a typo and sorts
    # ahead of everything. The separator is only meaningful after a number.
    name = re.sub(r'^[\s\-]+', '', name)
    fields = {}
    if phone:
        fields['B'] = phone
    if addr:
        fields['C'] = addr
    stores.append({
        'row': i + 4,
        'brand': "Jersey Mike's",
        'brandKey': 'jmacquisitions',
        'name': name,
        'order': len(stores),
        'completed': False,
        'fields': fields,
    })

with open('scripts/seed-jm-acquisitions-projects.json', 'w') as f:
    json.dump(stores, f, indent=1)
    f.write('\n')

print(json.dumps(report, indent=2))
print(f'\n{len(headers)} checklist items written (2 reference fields + tasks)')
print(f'{len(stores)} stores written')
print('stores missing an address:',
      [s['name'] for s in stores if 'C' not in s['fields']] or 'none')
