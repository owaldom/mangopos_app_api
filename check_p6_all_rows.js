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
        const res = await pool.query("SELECT location, product, attributesetinstance_id, units FROM stockcurrent WHERE product::text = '6'");
        console.log('Count:', res.rows.length);
        res.rows.forEach(r => console.log(JSON.stringify(r)));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
