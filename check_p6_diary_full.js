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
        console.log('--- All Stockdiary entries for P6 ---');
        const res = await pool.query("SELECT datenew, reason, units, concept FROM stockdiary WHERE product = '6' ORDER BY datenew DESC");
        res.rows.forEach(r => console.log(`${r.datenew.toISOString()} | Reason: ${r.reason} | Units: ${r.units} | Concept: ${r.concept}`));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
