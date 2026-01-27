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
        console.log('--- Products with duplicate stockcurrent entries (same loc, same attr) ---');
        const res = await pool.query(`
            SELECT location, product, attributesetinstance_id, COUNT(*) 
            FROM stockcurrent 
            GROUP BY location, product, attributesetinstance_id 
            HAVING COUNT(*) > 1
        `);
        console.log('Duplicates found:', res.rows.length);
        res.rows.forEach(r => console.log(JSON.stringify(r)));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
