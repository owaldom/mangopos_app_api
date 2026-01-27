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
        console.log('--- Triggers on stockcurrent ---');
        const res = await pool.query("SELECT tgname, relname FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'stockcurrent' AND NOT tgisinternal");
        console.table(res.rows);

        console.log('\n--- Triggers on stockdiary ---');
        const res2 = await pool.query("SELECT tgname, relname FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'stockdiary' AND NOT tgisinternal");
        console.table(res2.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
