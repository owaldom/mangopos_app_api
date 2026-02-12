const pool = require('./src/config/database');

async function debug() {
    try {
        const settingsRes = await pool.query("SELECT * FROM settings WHERE id IN ('igtf_enabled', 'igtf_percentage')");
        console.log('--- SETTINGS START ---');
        console.log(JSON.stringify(settingsRes.rows, null, 2));
        console.log('--- SETTINGS END ---');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

debug();
