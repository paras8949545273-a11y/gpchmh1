# Student ID Card Portal — Government Polytechnic College, Hanumangarh

A static website covering the full application → review → approval →
download/print workflow for college ID cards.

## Important: what this is (and isn't)

This is a **static, front-end-only site** built to run for free on GitHub
Pages. That means:

- There is **no real server, no real database, and no real
  server-enforced security**. Everything — accounts, applications, roles —
  is stored in the visitor's own browser (`localStorage`) and enforced by
  JavaScript running in that same browser.
- Passwords are hashed (SHA-256) before being stored, so nothing is kept in
  plain text — but this is **not equivalent to real authentication**.
  Anyone with access to the browser's dev tools can inspect or edit the
  stored data directly, and there's no rate-limiting, salting, or
  server-side check that a real login system would have.
- Data is **per-browser/device**. A student who registers on their phone
  won't see that account or application if they open the site on a laptop.
  The admin's approvals only exist in the browser the admin used.

This is well suited to a class project, a demo, or a small single-device
setup — not to a real production college system handling real students'
personal data at scale. If you need genuine security and multi-device data
(a real database, hashed-and-salted passwords verified server-side, actual
role enforcement that can't be bypassed by editing browser storage), you
would need real hosting with a backend — for example a small Node/Express +
PostgreSQL app, or Firebase Auth + Firestore — rather than GitHub Pages
alone. That's a larger build; ask if you'd like help scoping it out
separately.

## What's included

**Student side**
- Register / log in
- Dashboard showing admission no., branch, session, and application status
- My Profile (read-only — shows the last approved/submitted details)
- ID Card Application form with live preview, photo upload (validated as an
  image file under 2 MB), and admission number
- Application Status page showing the application ID, current status
  (Pending / Under Review / Approved / Rejected), and rejection reason if
  applicable, with a "Correct & Resubmit" flow
- Once approved: download the card as PNG or PDF, or print it directly

**Admin side**
- Separate admin login
- Dashboard with counts (Total / Pending / Under Review / Approved /
  Rejected) and a recent-applications list
- Applications page: search by name/admission number/application ID,
  filter by status, click into any application
- Application detail: edit/correct any submitted field, manually enter
  Serial/Dis. No., Date of Issue, and Valid Up To (these are **never**
  auto-generated — approval is blocked until all three are filled in),
  add internal notes, approve or reject (rejecting requires a reason)
- Students page: list of all registered accounts and their application status
- Settings page: edit the college name and affiliation line shown on the
  letterhead and ID card

**ID card**
- Matches the uploaded official format: logo, "IDENTITY CARD" heading,
  college name, affiliation line, Sr.No/Dis., date of issue, valid up to,
  student photo, Name / Father's Name / Date of Birth / Admission No. /
  Branch / Session / Address
- Three blank signature areas at the bottom: **Seal & Signature of Issuing
  Authority**, **Proctor of College**, and **Signature of Student** — none
  of these are digitally generated. Students print the card and get these
  signed physically.

## Files

```
index.html      Page structure and templates
style.css       All styling
app.js          App logic (routing, auth, applications, admin, ID card export)
assets/logo.png College emblem used on the letterhead and ID card
```

## Admin login

Default admin credentials:

- Username: `admin`
- Password: `admin123`

**Change these before you deploy** — open `app.js` and edit the
`ADMIN_USER` and `ADMIN_PASS` constants near the top of the file. These are
hardcoded into the page's JavaScript (there's no server to keep them
secret), so treat this login as a light access gate rather than real
security — anyone who reads the page source can find them.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `student-id-portal`).
2. Upload all the files in this folder (`index.html`, `style.css`, `app.js`,
   and the `assets` folder) to the repository, keeping the same folder
   structure.
3. In the repository, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`.
5. Choose the `main` branch and `/ (root)` folder, then click **Save**.
6. Wait a minute or two — GitHub will give you a live URL, usually:
   `https://<your-username>.github.io/student-id-portal/`

Any time you push changes to the repository, GitHub Pages will
automatically redeploy.

## Customizing

- **College name / affiliation**: editable live from the admin **Settings**
  page — no code changes needed.
- **Logo**: replace `assets/logo.png` with your own image (same filename),
  or update the `src` references in `index.html` if you use a different name.
- **Card layout / calibration**: the fixed layout (positions, field order,
  signature lines) lives in the `.id-card` rules in `style.css`. Adjust
  spacing or sizing there if you need to fine-tune the print output.
- **Photo size limit**: `MAX_PHOTO_BYTES` near the top of `app.js`.
