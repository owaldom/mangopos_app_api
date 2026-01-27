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
        console.log('Testing ON CONFLICT with NULL attributesetinstance_id');

        // Try to insert a row that might already exist
        // Product 6, Location 1, Attribute NULL
        const res = await pool.query(`
            INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
            VALUES (1, 6, NULL, 0)
            ON CONFLICT (location, product, attributesetinstance_id) 
            DO UPDATE SET units = stockcurrent.units + EXCLUDED.units
            RETURNING *
        `);
        console.log('Result:', JSON.stringify(res.rows));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

run();
