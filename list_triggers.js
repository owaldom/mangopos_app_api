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
        const res = await pool.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'stockcurrent'::regclass");
        res.rows.forEach(r => console.log(r.tgname));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
