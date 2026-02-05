const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

const runMigration = async () => {
    const migrationPath = path.join(__dirname, 'migrations', 'update_banks_v3.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error running migration:', err);
        process.exit(1);
    }
};

runMigration();
