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
        const res = await pool.query("SELECT * FROM products WHERE id = '6'");
        console.log('Product 6 details:', JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
