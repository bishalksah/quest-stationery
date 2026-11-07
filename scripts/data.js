/* Full backup and restore from your own computer.
     npm run backup                     -> writes backup-YYYY-MM-DD.json (includes item photos)
     npm run restore -- backup-file.json -> replaces ALL data in the database with the backup
   It uses the same database settings as the website (TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in a .env file). */
const fs = require('fs');
const db = require('../db');
const { BACKUP_TABLES } = require('../routes/admin');

(async () => {
  await db.ensure();
  const [, , cmd, file] = process.argv;
  if (cmd === 'backup') {
    const tables = {};
    for (const t of BACKUP_TABLES) tables[t] = await db.all(`SELECT * FROM ${t}`);
    const name = file || `backup-${new Date().toISOString().slice(0, 10)}.json`;
    fs.writeFileSync(name, JSON.stringify({ app: 'quest-stationery', version: 3, exported_at: new Date().toISOString(), photos_included: true, tables }));
    console.log('Saved', name, '-', BACKUP_TABLES.map(t => `${t}: ${tables[t].length}`).join(', '));
  } else if (cmd === 'restore' && file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.app !== 'quest-stationery') throw new Error('That does not look like a backup from this app.');
    await db.tx(async x => {
      for (const t of [...BACKUP_TABLES].reverse()) await x.run(`DELETE FROM ${t}`);
      for (const t of BACKUP_TABLES) for (const row of data.tables[t] || []) {
        const cols = Object.keys(row);
        await x.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => row[c]));
      }
    });
    console.log('Restored from', file);
  } else console.log('Usage: npm run backup   |   npm run restore -- <file.json>');
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
