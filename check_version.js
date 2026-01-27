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
        const res = await pool.query('SELECT version()');
        console.log(res.rows[0].version);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
