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
        console.log('--- Verifying Duplicates ---');
        const duplicates = await pool.query('SELECT product, location, attributesetinstance_id, COUNT(*) FROM stockcurrent GROUP BY product, location, attributesetinstance_id HAVING COUNT(*) > 1');
        console.log('Duplicates count:', duplicates.rows.length);

        console.log('\n--- Testing Index Fix (Attempting duplicate insert) ---');
        try {
            // This should FAIL now even with NULL attributesetinstance_id
            await pool.query('INSERT INTO stockcurrent (location, product, attributesetinstance_id, units) VALUES (1, 6, NULL, 10)');
            console.log('ERROR: Insert succeeded but should have failed!');
        } catch (e) {
            console.log('SUCCESS: Duplicate insert failed as expected:', e.message);
        }

        console.log('\n--- Final Stock for Product 6 ---');
        const res = await pool.query("SELECT * FROM stockcurrent WHERE product = '6'");
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
