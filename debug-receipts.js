const pool = require('./src/config/database');

async function debug() {
    try {
        console.log('--- Recent Receipts ---');
        const res = await pool.query(`
            SELECT id, datenew, currency_id, exchange_rate 
            FROM receipts 
            ORDER BY datenew DESC 
            LIMIT 5
        `);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('--- Taxlines for the last receipt ---');
        if (res.rows.length > 0) {
            const lastId = res.rows[0].id;
            const tlRes = await pool.query(`
                SELECT * FROM taxlines WHERE receipt = $1
            `, [lastId]);
            console.log(JSON.stringify(tlRes.rows, null, 2));
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

debug();
