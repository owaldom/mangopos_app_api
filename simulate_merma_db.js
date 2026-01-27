const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433
});

async function simulateMerma() {
    const client = await pool.connect();
    try {
        const product = '6';
        const location = 1;
        const units = -5; // 5 units of Merma
        const reason = -3;
        const price = 0.20;
        const concept = 'Manual Test Merma';

        console.log('--- BEFORE ---');
        const beforeRes = await client.query("SELECT units FROM stockcurrent WHERE product = $1", [product]);
        console.log('Stock:', beforeRes.rows[0].units);

        await client.query('BEGIN');

        // 1. stockdiary
        await client.query(`
            INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
            VALUES (NOW(), $1, $2, $3, $4, $5, $6)
        `, [reason, location, product, units, price, concept]);

        // 2. stockcurrent
        await client.query(`
            UPDATE stockcurrent 
            SET units = units + $1 
            WHERE location = $2 AND product = $3
        `, [units, location, product]);

        await client.query('COMMIT');

        console.log('--- AFTER ---');
        const afterRes = await client.query("SELECT units FROM stockcurrent WHERE product = $1", [product]);
        console.log('Stock:', afterRes.rows[0].units);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

simulateMerma();
