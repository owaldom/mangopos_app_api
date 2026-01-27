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
        const productId = 6;
        const unitsToSell = 3;

        console.log('--- Initial Stock ---');
        const initialRes = await pool.query('SELECT units FROM stockcurrent WHERE product = $1', [productId]);
        const initialUnits = parseFloat(initialRes.rows[0].units);
        console.log('Units:', initialUnits);

        console.log('\n--- Simulating Sale (Units: ' + unitsToSell + ') ---');
        // Logic from salesController.js
        // Note: attributesetinstance_id will be NULL in VALUES, matches index correctly now
        await pool.query(`
            INSERT INTO stockcurrent (location, product, units)
            VALUES (1, $1, $2)
            ON CONFLICT (location, product, attributesetinstance_id) 
            DO UPDATE SET units = stockcurrent.units + $2
        `, [productId, -unitsToSell]);

        console.log('--- Final Stock ---');
        const finalRes = await pool.query('SELECT units FROM stockcurrent WHERE product = $1', [productId]);
        const finalUnits = parseFloat(finalRes.rows[0].units);
        console.log('Units:', finalUnits);

        console.log('Difference:', finalUnits - initialUnits);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
