const pool = require('./src/config/database');

async function fixAllTicketsNum() {
    try {
        const res = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE 'ticketsnum%'
    `);

        const tables = res.rows.map(r => r.table_name);
        console.log(`Found ${tables.length} correlative tables.`);

        for (const table of tables) {
            const countRes = await pool.query(`SELECT COUNT(*) FROM ${table}`);
            const count = parseInt(countRes.rows[0].count);

            if (count === 0) {
                console.log(`Initializing empty table: ${table}`);
                await pool.query(`INSERT INTO ${table} (id) VALUES (0)`);
                console.log(`${table} initialized.`);
            } else {
                console.log(`${table} is OK (${count} rows).`);
            }
        }

        console.log('--- Correlative Initialization Completed ---');
    } catch (err) {
        console.error('Error initializing correlatives:', err);
    } finally {
        await pool.end();
    }
}

fixAllTicketsNum();
