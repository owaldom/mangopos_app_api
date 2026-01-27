const pool = require('./src/config/database');

async function check() {
    try {
        console.log('Searching for "Vale" in payments table:');
        const res = await pool.query("SELECT DISTINCT payment FROM payments WHERE payment ILIKE '%vale%'");
        console.table(res.rows);

        console.log('\nSearching for "Vale" in payments_account table:');
        const res2 = await pool.query("SELECT DISTINCT payment FROM payments_account WHERE payment ILIKE '%vale%'");
        console.table(res2.rows);

        console.log('\nAll distinct payments:');
        const res3 = await pool.query("SELECT DISTINCT payment FROM payments");
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
