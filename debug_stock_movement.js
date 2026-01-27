const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433
});

async function debugStockMovement() {
    try {
        const productId = 6; // Cacao Mantoro as a test
        const locationId = 1; // General
        const unitsToSubtract = 5;
        const reason = -3; // Merma / Rotura (OUT_BREAK)

        console.log('--- Initial Stock ---');
        const initialRes = await pool.query('SELECT * FROM stockcurrent WHERE product = $1 AND location = $2', [productId, locationId]);
        console.table(initialRes.rows);
        const initialUnits = initialRes.rows[0]?.units || 0;

        console.log(`\n--- Simulating Merma movement: ${unitsToSubtract} units ---`);
        const signedUnits = unitsToSubtract * -1; // sign for OUT_BREAK is -1

        await pool.query('BEGIN');

        // 1. Insert in stockdiary
        await pool.query(`
            INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
            VALUES (NOW(), $1, $2, $3, $4, 0, 'DEBUG TEST MERMA')
        `, [reason, locationId, productId, signedUnits]);

        // 2. Update stockcurrent
        const updateRes = await pool.query(`
            UPDATE stockcurrent 
            SET units = units + $1 
            WHERE location = $2 AND product = $3
        `, [signedUnits, locationId, productId]);

        if (updateRes.rowCount === 0) {
            await pool.query(`
                INSERT INTO stockcurrent (location, product, units)
                VALUES ($1, $2, $3)
            `, [locationId, productId, signedUnits]);
        }

        console.log('--- Final Stock ---');
        const finalRes = await pool.query('SELECT * FROM stockcurrent WHERE product = $1 AND location = $2', [productId, locationId]);
        console.table(finalRes.rows);
        const finalUnits = finalRes.rows[0]?.units || 0;

        console.log(`Initial: ${initialUnits}, Change: ${signedUnits}, Final: ${finalUnits}`);
        console.log(`Difference: ${finalUnits - initialUnits}`);

        await pool.query('ROLLBACK'); // Don't persist test
        console.log('\nTest completed (Rollbacked).');

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debugStockMovement();
