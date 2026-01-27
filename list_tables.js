const fs = require('fs');
const pool = require('./src/config/database');

async function listTables() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
        const tables = res.rows.map(r => r.table_name).join('\n');
        fs.writeFileSync('full_tables_list.txt', tables);
        console.log(`Successfully wrote ${res.rows.length} tables to full_tables_list.txt`);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

listTables();
