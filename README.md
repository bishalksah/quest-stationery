<<<<<<< HEAD
# Quest Stationery Store (version 3, Vercel ready)

Stationery management for Quest Group of Institutions.
Stack: Node.js, Express, libSQL/SQLite (a local file, or a hosted Turso database), plain HTML/CSS/JS. Nothing to compile.

**To put it online on Vercel, read DEPLOY.md.**

## Run
1. Install Node.js 22.13 or newer (Node 24 works) from https://nodejs.org
2. In this folder run:  npm install
3. Start the server:    npm start
4. Open http://localhost:3000

First sign in: username `admin`, password `admin123` (shown as Miss Surjeet Kaur).
Change it straight away: top right account button, then Change password.
To start with a different password or name, set these before the very first start:
  ADMIN_PASS, ADMIN_NAME, ADMIN_USER   (after the first start, use the app to change them)

## Upgrading from an earlier version
Copy your old `stationery.db` into this folder before the first start. It is upgraded automatically
and all old items and records are kept. Institutions found in old records are added to the Institutions list.

## First steps
1. Admin, Institutions: add each college or school (a monthly budget is optional).
2. Admin, Users: add department users (they send requests) and management users (view only).
3. Store items: add items, or Import a CSV file. Add a price so reports can show values.

## Roles
- Store administrator: everything.
- Department user: browses the store and sends requests for their own institution, sees only their requests and slips.
- Management (view only): dashboard, records and reports, nothing can be changed.

## Features
- Requests: department asks, administrator approves (can change quantities) or rejects with a reason; approval issues the items and makes a slip.
- Issue items: scan a barcode or pick items, many items per slip, stock reduces automatically.
- Printable issue slips with logo and signature lines (Print, or save as PDF from the print window).
- Returns, damage and stock-take corrections, all with a reason.
- Purchase records: supplier, bill number and rate when restocking.
- Reports: monthly use and purchases, by institution, budgets, most used items, suppliers, reorder suggestions. Print or save as PDF.
- Monthly budget per institution with warnings at 90% and when crossed.
- Notifications bell for alerts and activity (each person sees their own).
- Audit log of who did what. CSV downloads open in Excel.
- Item photos and barcodes. CSV import. Dark mode. Works on phones.
- Backups: download a copy from Admin, Backup; `npm run backup` and `npm run restore` work from your computer.

## Restore a backup
`npm run restore -- backup-file.json` (replaces all data in the database the project is pointed at).

## Optional email alerts
Set before `npm start`: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL.
Administrators with an email address in their profile also receive low-stock and budget alerts.
=======
# quest-stationery
>>>>>>> 1859af693d5bbaf25e9444e9d6c78689c46c1c73
