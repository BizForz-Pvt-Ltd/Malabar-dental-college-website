# Department HOD implementation review

Review date: 9 October 2026. Baseline branch: `afsal`. Baseline HEAD:
`8953f5fdc5746e17217a079d3ea1ecde5d5ba211`. The working tree was clean before editing.
No backend changes, staging, commits, pushes, merges, or deployments were performed.

## Source audit

The website consists of static HTML pages using the Kingster / GoodLayers theme,
local theme CSS, jQuery, inline page JavaScript, and existing Font Awesome icons.
There is no root package manifest, build pipeline, or existing test framework.

All 17 requested files have exactly one `#staff-list-container` and the specified
department endpoint. Thirteen pages had copied HOD templates, unsafe interpolation
of API values into HTML, exact designation checks, and no displayed API contacts.
Conservative Dentistry, General Medicine, General Pathology, and General Surgery
had no dynamic HOD extraction.

Oral Medicine detected `Professor & HOD` but filtered `Professor & Vice Principal`
inside both category renderers. That duplicated its HOD and could hide unrelated
staff. Public Health expected `Reader & HOD` while its live response identifies
Dr Abdul Saheer P as `Professor & HOD`. Some other pages filtered exact HOD
designations from both categories, potentially removing non-teaching records.

Each page has its own designation priority table and name-based secondary sorting.
Anatomy prioritizes Lecturer; Public Health prioritizes Sr. Lecturer; Oral Medicine
also gives Reader & HASA a priority. These differences are retained. Public Health
has custom mobile CSS and programme galleries, which are retained.

The Department Faculty headings in Anatomy, Physiology, General Microbiology,
and Conservative Dentistry existed only inside commented blocks. Only the missing
live headings were added; the old blocks were not uncommented.

Existing visible editorial biographies remain in General Medicine, General
Pathology, Pharmacology, General Surgery, and General Microbiology. Existing
commented biographies and staff content also remain. They are not a source of
dynamic HOD selection.

The complete post-change comparison against HEAD confirmed preservation of all
unrelated markup, commented content, inline scripts, static biographies, and
designation priority tables. The only additional layout adjustment removes vertical
padding from eight audited empty theme wrappers when an API HOD is present.
Header, menus, breadcrumbs, footer, WhatsApp, galleries, forms, research, admissions,
API IDs, filenames, and URLs remain unchanged. `dept_of_IT.html` and
`research-and-development.html` were not modified.

## Changed files

The 17 department HTML files listed in the coverage table include the shared CSS
and JavaScript, provide the HOD mount immediately after the live faculty heading,
reuse their existing fetch response, and feed the filtered copies into their
original staff card renderers. Old dynamic HOD templates and designation filters
were removed.

Targeted card corrections validate portrait URLs, retain safe portrait clicks,
handle absent names/designations, and allow the 300px grid minimum to shrink on
narrow screens. Staff priority tables, alphabetical ordering, card appearance,
and teaching/non-teaching category behavior are otherwise retained. Original API
arrays are not changed by renderer sorting.

| Added file | Purpose |
|---|---|
| `js/department-hod.js` | Shared designation detection, staff selection, safe HOD DOM rendering, optional contacts, image fallbacks, and staff error message. |
| `css/department-hod.css` | Scoped responsive HOD styles, missing faculty headings, and conditional empty-spacer adjustment. |
| `tests/department-hod.test.cjs` | Dependency-free Node fixture tests and integration checks for all 17 inline staff renderers. |
| `tests/department-hod-browser.cjs` | Dependency-free local server and optional headless Edge/Chrome verification at three widths, with synthetic fixtures or live API response replay. |
| `docs/department-hod-review.md` | Audit, coverage, executed verification, limitations, and manual review instructions. |

Total: 17 modified HTML files and five added files.

## Department coverage

“Pass” includes source mapping, fixture integration, browser checks at 360px,
768px, and 1440px, and browser replay of the department's live API response.
Duplicate prevention selects exactly one teaching HOD by object identity; no HOD
or multiple HOD candidates leave all records in their normal categories.

| Department | HTML filename | API ID | HOD support | Duplicate prevention | Tests |
|---|---|---:|---|---|---|
| Anatomy | `anatomy.html` | 85 | Added/verified | Verified | Pass |
| Physiology | `physiology.html` | 50 | Added/verified | Verified | Pass |
| Biochemistry | `biochemistry.html` | 51 | Added/verified | Verified | Pass |
| General Pathology | `general-pathology.html` | 88 | Added/verified | Verified | Pass |
| General Microbiology | `general-microbiology.html` | 86 | Added/verified | Verified | Pass |
| Pharmacology | `pharmacology.html` | 87 | Added/verified | Verified | Pass |
| General Medicine | `general-medicine.html` | 89 | Added/verified | Verified | Pass |
| General Surgery | `general-surgery.html` | 90 | Added/verified | Verified | Pass |
| Oral Pathology | `oral-pathology.html` | 40 | Added/verified | Verified | Pass |
| Public Health Dentistry | `public-health.html` | 45 | Added/verified | Verified | Pass |
| Periodontology | `periodontology.html` | 47 | Added/verified | Verified | Pass |
| Oral Medicine & Radiology | `oral-medicine-and-radiology.html` | 46 | Added/verified | Verified | Pass |
| Orthodontics | `orthodontics.html` | 48 | Added/verified | Verified | Pass |
| Oral & Maxillofacial Surgery | `oral-and-maxilofacial-surgery.html` | 44 | Added/verified | Verified | Pass |
| Conservative Dentistry & Endodontics | `conservative-dentistry-&-edodontics.html` | 42 | Added/verified | Verified | Pass |
| Prosthodontics | `prosthodontic.html` | 41 | Added/verified | Verified | Pass |
| Pedodontics | `pedodontics.html` | 43 | Added/verified | Verified | Pass |

## Executed verification

- `node --test tests/department-hod.test.cjs`: **114 passed; zero failed/skipped**.
  Covers Professor/Reader/Associate Professor/Lecturer HOD, full titles,
  capitalization, whitespace, punctuation, Hod In Charge, false positives, missing
  arrays, non-teaching only, missing fields, unsafe text/URLs, contact validation,
  image failure, multiple candidates, repeated rendering, object identity,
  order preservation, category preservation, and network/HTTP/JSON/status failures.
- `node tests/department-hod-browser.cjs --live`: **73 browser scenarios passed**.
  Includes all 17 pages at 360/768/1440px (51 scenarios), five edge cases, and 17
  live API response replays. Checks one fetch/mount, HOD placement, contacts,
  stacked/mobile and horizontal/desktop layout, and faculty-area overflow.
- Live API reads returned HTTP 200 and `status: true` for all 17 departments.
  Oral Medicine selected Dr. Asaf Aboobakker and retained 5 teaching / 5 non-teaching
  records. Public Health selected Dr Abdul Saheer P and retained 2 teaching /
  1 non-teaching record. No live response had multiple HOD candidates.
- JavaScript syntax checks passed for the shared helper, test scripts, and every
  inline script in all 17 changed pages. `git diff --check` passed.
- Complete diffs were reviewed. Baseline comparisons confirmed preservation of
  unrelated HTML, scripts, static/commented biographies, and designation priorities.

The initial browser attempt through the in-app tool failed due to an environment
configuration error. A sandboxed headless browser subsequently timed out. The
successful tests used the installed headless Edge outside the sandbox. An early
browser test had a loading race; its wait condition was corrected before the
successful final runs. Early fixture expectations assumed uniform sorting; they
were corrected to account for the original page-specific sort priorities.

Browser fixtures mock the existing fetch in the test browser only. Production
fetches, CORS, API contracts, and HTML are unchanged. Most external services and
remote images are blocked during deterministic tests; image failures use the
tested neutral fallback. Oral Medicine's public HOD image is additionally checked
with remote image loading enabled. Other staff photographs, external integrations,
form submissions, and production-origin CORS were not exhaustively tested.

Screenshots are saved under the temporary directory printed by the browser test.
Synthetic portraits are explicitly labelled as test fixtures and never appear in
production source or API data.

Final run screenshots:

- Desktop with the actual Oral Medicine API portrait:
  `C:/Users/DELL/AppData/Local/Temp/mdcrc-hod-browser-4Npy4k/hod-live-1440.png`.
- Mobile with clearly labelled synthetic fixture data:
  `C:/Users/DELL/AppData/Local/Temp/mdcrc-hod-browser-4Npy4k/hod-360.png`.

Both screenshots were visually inspected. The actual Oral Medicine HOD portrait
loaded successfully, and the displayed email and mobile number matched the selected
API object.

## Manual review

1. From the repository root, run `node tests/department-hod-browser.cjs --serve`.
   Open `http://127.0.0.1:8080/oral-medicine-and-radiology.html` in a browser.
   Stop the server with Ctrl+C when finished.
2. Check Oral Medicine and Public Health at 360px, 768px, and desktop width.
   Confirm HOD placement below Department Faculty, API designation/contact text,
   clickable mailto/tel links, correct portraits/fallbacks, and no repeated HOD in
   Teaching Staff. Confirm counts against the current API, since live data changes.
3. Check all remaining files in the coverage table. Verify sorting, every remaining
   staff record, category headings, and no empty HOD section where no HOD is supplied.
4. Verify no horizontal overflow, readable long email addresses, stacked mobile
   portraits, keyboard-accessible contacts, and a stable portrait area.
5. Use the fixture runner for omitted email/phone/photo, broken photos, unsafe text,
   missing/no HOD, multiple HODs, and staff-fetch errors. Confirm ambiguous records
   remain visible and a console warning appears; errors affect only the staff area.
6. Check menus, breadcrumbs, department links, galleries, footer, WhatsApp, research
   and admissions links, and preserved static biographies against the baseline.
7. If localhost CORS blocks the API, use `node tests/department-hod-browser.cjs`
   for offline fixtures or append `--live` for read-only live response replay.
   Do not add a production proxy or weaken CORS.

## Remaining API and content issues

- Anatomy (85): three teaching records, none designated HOD. No HOD is invented.
- General Pathology (88) and Pharmacology (87): both arrays are empty. Static
  biographies identify Dr. Rajesh S Patil and Dr. Geetha Muniswamy respectively;
  the content/backend team should confirm whether those profiles remain current.
- General Medicine (89): one teaching record, no HOD designation. Its preserved
  static biography identifies Dr. Sachin Menon and needs content-team confirmation.
- General Surgery (90): API HOD is Dr. Shaheer P M (`Reader & HOD`), while the
  preserved editorial biography names Dr. Gopinath K V. This conflict needs review.
- Biochemistry (51): the API identifies RAMYA. T. R as `Hod In Charge`. This clear
  designation is supported and displayed verbatim.
- Physiology (50): API HOD is Dr. Neethu Vins. Old commented profiles name Dr. Rahmath;
  those comments remain unchanged and are not used for selection.

No multiple-HOD ambiguity was observed in live data. Future ambiguities retain
all records in Teaching Staff and log a warning for manual review.

## Deployment readiness

The frontend changes are ready for manual review and deployment by the maintainer.
API omissions and stale editorial biographies require separate content/backend
confirmation. No deployment was performed.
