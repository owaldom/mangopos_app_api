const pool = require('./src/config/database');

async function fixCxpDb() {
    try {
        const tables = ['ticketsnum_payment_purchase', 'ticketsnum_abono_purchase'];

        for (const table of tables) {
            console.log(`Checking table ${table}...`);
            const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
            if (parseInt(res.rows[0].count) === 0) {
                console.log(`Initializing ${table}...`);
                await pool.query(`INSERT INTO ${table} (id) VALUES (0)`);
                console.log(`${table} initialized.`);
            } else {
                console.log(`${table} already has data.`);
            }
        }

        console.log('CXP DB Fix completed successfully.');
    } catch (err) {
        console.error('Error fixing CXP DB:', err);
    } finally {
        await pool.end();
    }
}

fixCxpDb();
