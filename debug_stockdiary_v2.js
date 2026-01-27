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
        const res = await pool.query("SELECT id, datenew, reason, units, product FROM stockdiary WHERE reason = -3 AND units > 0");
        console.log('Positive units for -3:', res.rows.length);
        res.rows.forEach(r => console.log(JSON.stringify(r)));

        const res2 = await pool.query("SELECT id, datenew, reason, units, product FROM stockdiary WHERE reason = -3 AND units < 0");
        console.log('Negative units for -3:', res2.rows.length);
        res2.rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
