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
        console.log('--- Duplicate rows in stockcurrent ---');
        const res = await pool.query(`
            SELECT product, location, attributesetinstance_id, COUNT(*) 
            FROM stockcurrent 
            GROUP BY product, location, attributesetinstance_id 
            HAVING COUNT(*) > 1
        `);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('\n--- Rows for product 6 with different attributes ---');
        const res2 = await pool.query("SELECT * FROM stockcurrent WHERE product = '6'");
        console.log(JSON.stringify(res2.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
