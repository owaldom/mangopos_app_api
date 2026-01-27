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
        console.log('--- Products ---');
        const res = await pool.query("SELECT id, name FROM products WHERE id::text = '6'");
        res.rows.forEach(r => console.log(JSON.stringify(r)));

        console.log('\n--- Stockcurrent ---');
        const res2 = await pool.query("SELECT * FROM stockcurrent WHERE product::text = '6'");
        res2.rows.forEach(r => console.log(JSON.stringify(r)));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
