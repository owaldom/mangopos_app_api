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
        const res = await pool.query("SELECT units FROM stockcurrent WHERE product = '6'");
        console.log('Stock current for product 6:', JSON.stringify(res.rows));

        const res2 = await pool.query("SELECT SUM(units) as total FROM stockdiary WHERE product = '6'");
        console.log('Sum of stockdiary for product 6:', JSON.stringify(res2.rows));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
