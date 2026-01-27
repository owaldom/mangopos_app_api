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
        console.log('--- Stockdiary entries for P6 with attributes ---');
        const res = await pool.query("SELECT * FROM stockdiary WHERE product = '6' AND attributesetinstance_id IS NOT NULL");
        console.log('Count:', res.rows.length);
        res.rows.forEach(r => console.log(JSON.stringify(r)));

        console.log('\n--- Stockcurrent entries for P6 with attributes ---');
        const res2 = await pool.query("SELECT * FROM stockcurrent WHERE product = '6' AND attributesetinstance_id IS NOT NULL");
        console.log('Count:', res2.rows.length);
        res2.rows.forEach(r => console.log(JSON.stringify(r)));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
