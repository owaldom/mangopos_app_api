const pool = require('./src/config/database');

async function describeTables() {
    try {
        const tables = ['stockdiary', 'stockcurrent', 'locations'];
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
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

describeTables();
