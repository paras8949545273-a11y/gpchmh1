# GPC Hanumangarh — Student Identity Card Portal

A focused, production-ready web app for **Government Polytechnic College, Hanumangarh**
that lets students apply for their college ID card, and lets admins review, correct,
approve/reject, and generate the final printable card.

Only two roles exist: **Student** and **Admin**. No unrelated features (no attendance,
fees, notifications, chatbots, analytics dashboards, etc.) were added, per the spec.

## Why zero npm dependencies

This build deliberately uses **only Node.js's built-in modules** — `node:http`,
`node:sqlite`, `node:crypto`, `node:fs` — instead of Express/React/Prisma/etc.
That means:

- `npm install` is not required to run it — just `node server.js`.
- There is no build step, no bundler, no framework version drift.
- The whole stack is auditable in a few hundred lines per file.

`node:sqlite` is available and stable enough for this from **Node.js 22.5+** (it prints
an "experimental" warning on the console — that's expected and harmless). Check your
version with `node -v`; upgrade if you're on an older Node 22, or on Node 18/20.

If you'd prefer Express + a battle-tested ORM + React later, the code is organized so
that's a straightforward swap (routes are already separated from HTTP plumbing in
`src/routes/`).

## Getting started

```bash
cd gpc-id-portal
cp .env.example .env      # then edit .env — set SESSION_SECRET and the default admin password
node server.js
```

Open **http://localhost:3000**.

- A default admin account is created automatically on first run, using
  `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` from `.env`. **Log in and note this
  is only a bootstrap account** — there's no self-serve "create another admin" flow by
  design (admins should be provisioned deliberately, e.g. by editing the database or
  adding a small internal script).
- Students self-register at `/register.html`, then log in at `/login.html`.

The SQLite database file is created at `data/gpc_id_portal.sqlite`. Uploaded photos are
stored under `uploads/photos/`. Back up both directories together.

## How the ID card is generated

`src/utils/idcard-config.js` is the **single file** that defines the official card
layout — the fixed heading text, where the photo goes, where each field is printed,
and where the three blank signature/seal areas sit. `src/utils/idcard-render.js` reads
that config and draws an SVG for any approved application. Nothing else in the codebase
needs to change to recalibrate the card — see the comment block at the top of
`idcard-config.js` for the calibration workflow.

**No reference image of the official card was attached when this project was
generated**, so the current coordinates are a careful reconstruction from the written
spec (heading, Sr.No/Date of issue/Valid up to block, photo + fields, blank signature
lines, Proctor of College line at the bottom). Before this goes live, compare a
generated card side-by-side with a real physical card and nudge the coordinates in
`idcard-config.js` until they match exactly.

## What the spec asked us *not* to do (and this build respects)

- Serial/Dis. Number, Date of Issue, and Valid Up To are **only** ever set by an admin
  typing them in on the approval screen — nothing calculates or generates them.
- The Issuing Authority seal/signature, the student's signature, and the Proctor of
  College's signature areas are **always rendered blank** — students print the card and
  get these physically from the college.
- No drag-and-drop template builder — layout is one plain config file, per the spec.
- No QR codes, barcodes, gradients, or "modernized" redesign of the card.

## Downloading / printing the card

The portal generates the card as SVG (crisp at any print size) and gives the student a
print-optimized page (`/student/idcard.html`) sized to the correct CR80 card
proportions, plus a raw SVG download. This relies on the browser's native
**Print → Save as PDF** for the PDF step, because true server-side PDF rendering
(e.g. via Puppeteer or PDFKit) needs packages that require `npm install` with network
access. If you want fully automated PDF generation instead:

```bash
npm install puppeteer
```

and add a small route that loads `/student/idcard.html`-equivalent HTML in headless
Chromium and calls `page.pdf()`. The SVG renderer already gives you print-quality
(300dpi-equivalent) output to feed into that.

## Security notes

- Passwords are hashed with `scrypt` + a random salt (`node:crypto`), never stored
  in plain text.
- Sessions are random 256-bit tokens stored server-side (in the `sessions` table) and
  set as an `HttpOnly`, `SameSite=Lax` cookie — not a client-decodable JWT.
- Every student and admin API route re-checks the session and role **on the server**;
  the frontend redirects are a UX convenience only, not the actual access control.
- Students can only ever read/write their own `student_id`'s rows — every student query
  is scoped by the authenticated user's own student record, never by a client-supplied id.
- Uploaded photos are validated by magic-byte sniffing (not just the browser-supplied
  `Content-Type`), capped at 3MB, and written under a random filename outside of any
  user-controlled path.
- Set `SESSION_SECRET` to a long random value and `COOKIE_SECURE=true` once you deploy
  behind HTTPS (see `.env.example`).

## Project structure

```
server.js                     HTTP server + router + static file serving
src/db.js                     SQLite schema (users, students, id_card_applications, sessions)
src/auth.js                   Password hashing, sessions, cookies
src/seed.js                   Creates the bootstrap admin account
src/utils/multipart.js        Dependency-free multipart/form-data parser (photo uploads)
src/utils/photo.js            Photo validation + storage
src/utils/idcard-config.js    ← calibrate the official card layout here
src/utils/idcard-render.js    Renders an application's data into the card SVG
src/utils/http.js             Small JSON/body helpers
src/routes/auth-routes.js     Register / student login / admin login / logout / me
src/routes/student-routes.js  Profile, apply, application status, view ID card
src/routes/admin-routes.js    Stats, list/search/filter, edit, approve, reject, students
public/                       Plain HTML/CSS/JS frontend (no build step)
data/                         SQLite database file (created at runtime)
uploads/photos/               Uploaded student photographs (created at runtime)
```

## Manual test checklist

- [ ] Student registration / login
- [ ] Admin login (separate URL, separate credentials)
- [ ] A student cannot open any `/admin/*` page or call any `/api/admin/*` route
- [ ] Submit an application with a photo → live preview updates as you type
- [ ] Application shows as **Pending**, gets a `GPC-000001`-style ID
- [ ] Admin opens it, edits a field, and it becomes **Under Review**
- [ ] Admin rejects with a reason → student sees the reason and can correct & resubmit
      → status returns to **Pending**
- [ ] Admin manually enters Serial No. / Date of Issue / Valid Up To and approves
- [ ] Student sees **Approved**, views the ID card, downloads and prints it
- [ ] Approved card shows blank signature/seal areas and the Proctor of College line
- [ ] Approved application's fields are locked from further editing
- [ ] Resize the browser to a phone width — every page stays usable
