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
        const res = await pool.query(`
            SELECT indexdef FROM pg_indexes WHERE tablename = 'stockcurrent'
        `);
        res.rows.forEach(r => console.log(r.indexdef));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
