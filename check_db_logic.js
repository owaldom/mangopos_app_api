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
        console.log('--- Checking for any constraints or rules on stockcurrent ---');
        const res = await pool.query("SELECT * FROM pg_rules WHERE tablename = 'stockcurrent'");
        console.log('Rules:', JSON.stringify(res.rows));

        const res2 = await pool.query("SELECT * FROM pg_trigger WHERE tgrelid = 'stockcurrent'::regclass");
        console.log('Triggers (all):', res2.rows.length);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
