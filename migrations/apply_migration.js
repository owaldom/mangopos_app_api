const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const runMigration = async () => {
    try {
        const sqlPath = path.join(__dirname, 'create_report_views.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Executing migration:', sqlPath);
        await pool.query(sql);
        console.log('Migration applied successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();
