# Putting the Stationery Store on Vercel

Vercel runs your website, but it cannot keep a database file. So the data lives in a hosted database called
Turso (free plan available), and Vercel talks to it. You do this once.

## Part 1: Create the database (about 5 minutes)
1. Go to https://turso.tech and sign up.
2. Create a new database (any name, for example `quest-stationery`). Choose a region close to you.
3. Open the database and copy two things:
   - the **database URL** (it starts with `libsql://`)
   - an **access token** (create one from the database page)
   Keep both private. Anyone with the token can read your data.
   (If you prefer the command line, `turso db show --url <name>` and `turso db tokens create <name>` give the same two values.
   On Windows the Turso command line runs inside WSL, so the website is easier.)

## Part 2: Put the project on GitHub
1. Create a free account at https://github.com and make a new **private** repository.
2. Upload this project folder to it (GitHub Desktop is the easiest way on Windows).
   The `.gitignore` file already keeps your passwords and local data out of GitHub.

## Part 3: Deploy on Vercel
1. Go to https://vercel.com, sign in with GitHub, choose **Add New, Project**, and import your repository.
2. Before pressing Deploy, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://...` address from Part 1 |
   | `TURSO_AUTH_TOKEN` | the token from Part 1 |
   | `ADMIN_PASS` | a strong password for the first administrator (do this, so the site never has the default password) |
   | `ADMIN_NAME` | `Miss Surjeet Kaur` (optional) |
3. Press **Deploy**. When it finishes, open the address Vercel shows you.
4. Sign in as `admin` with the password you set in `ADMIN_PASS`. The database is prepared automatically on the first visit.
5. Add institutions and users, as in the README.

If the page shows "Something went wrong on the server": check the two Turso values for typos, then look at
Vercel, your project, **Logs**.

## Moving the data you already have (optional)
Do this only if you used the program on your computer first and want to keep that data.
1. On your computer, in the project folder, run `npm run backup`. This creates `backup-YYYY-MM-DD.json`.
   (Do this before creating the `.env` file below, so it reads your local data.)
2. Copy `.env.example` to `.env` and fill in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. Run `npm run restore -- backup-YYYY-MM-DD.json`. This replaces everything in the Turso database with your backup,
   including the users and their passwords.

## Good to know
- **Cost:** Turso's free plan and Vercel's free plan are enough to start. Vercel's free "Hobby" plan is meant for personal,
  non-commercial use, so check Vercel's terms and pricing for an institution. Plan limits change, so check turso.tech/pricing too.
- **Sign-in lasts 8 hours.** Changing a password signs out every other device.
- **Time zone:** times are kept in Indian time (UTC+5:30). To change it, add `TZ_OFFSET_MINUTES` (for example `0` for UTC).
- **Photos:** keep item photos small. They are shrunk automatically. Very large catalogues with many photos may load slowly.
- **Backups:** use Admin, then Backup, then Download backup now, about once a month. `npm run backup` also saves photos.
- **Running on your own computer:** `npm install`, then `npm start`. Without a `.env` file it uses the local file `stationery.db`.
- **Email alerts:** add the `SMTP_...` and `ALERT_EMAIL` settings in Vercel's Environment Variables.
