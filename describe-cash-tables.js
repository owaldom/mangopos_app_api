const pool = require('./src/config/database');

async function describeCashTables() {
    try {
        const tables = ['closedcash', 'payments', 'receipts'];
        for (const table of tables) {
            console.log(`\n--- ${table} ---`);
            const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [table]);
            res.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));
        }

        console.log('\n--- Active Cash Sessions ---');
        const activeRes = await pool.query('SELECT * FROM closedcash WHERE dateend IS NULL');
        console.log(JSON.stringify(activeRes.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

describeCashTables();
