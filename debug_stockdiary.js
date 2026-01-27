const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433
});

async function run() {
    try {
        console.log('--- All Reasons Summary ---');
        const res = await pool.query("SELECT reason, SUM(units) as total_units FROM stockdiary GROUP BY reason");
        res.rows.forEach(r => console.log(JSON.stringify(r)));

        console.log('\n--- Test Entry for Reason -3 ---');
        // Let's see if there ARE any -3 entries
        const res2 = await pool.query("SELECT * FROM stockdiary WHERE reason = -3 LIMIT 1");
        console.log(JSON.stringify(res2.rows));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
