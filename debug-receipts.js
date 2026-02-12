const pool = require('./src/config/database');

async function debug() {
    try {
        console.log('--- Recent Receipts ---');
        const res = await pool.query(`
            SELECT r.id, r.datenew, r.currency_id, r.exchange_rate, r.change,
                   (SELECT COALESCE(SUM(total), 0) FROM payments WHERE receipt = r.id) as payment_total
            FROM receipts r
            ORDER BY r.datenew DESC
            LIMIT 5
        `);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('--- Checking for change column ---');
        try {
            await pool.query(`ALTER TABLE receipts ADD COLUMN change double precision DEFAULT 0`);
            console.log('Column "change" added successfully.');
        } catch (e) {
            if (e.code === '42701') {
                console.log('Column "change" already exists.');
            } else {
                console.error('Error adding column:', e);
            }
        }

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
