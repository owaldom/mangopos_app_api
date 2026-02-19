const pool = require('./src/config/database');

async function initPurchaseTickets() {
    try {
        console.log('Checking ticketsnum_purchase...');
        const res = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'ticketsnum_purchase'");

        if (res.rows[0].count === '0') {
            console.log('Creating table ticketsnum_purchase...');
            await pool.query('CREATE TABLE ticketsnum_purchase (id int4 NOT NULL)');
            await pool.query('INSERT INTO ticketsnum_purchase (id) VALUES (0)');
        } else {
            const countRes = await pool.query('SELECT count(*) FROM ticketsnum_purchase');
            if (countRes.rows[0].count === '0') {
                console.log('Inserting initial row into ticketsnum_purchase...');
                await pool.query('INSERT INTO ticketsnum_purchase (id) VALUES (0)');
            }
        }

        console.log('Checking ticketsnum_refund_purchase...');
        const resRef = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'ticketsnum_refund_purchase'");
        if (resRef.rows[0].count === '0') {
            console.log('Creating table ticketsnum_refund_purchase...');
            await pool.query('CREATE TABLE ticketsnum_refund_purchase (id int4 NOT NULL)');
            await pool.query('INSERT INTO ticketsnum_refund_purchase (id) VALUES (0)');
        } else {
            const countResRef = await pool.query('SELECT count(*) FROM ticketsnum_refund_purchase');
            if (countResRef.rows[0].count === '0') {
                await pool.query('INSERT INTO ticketsnum_refund_purchase (id) VALUES (0)');
            }
        }

        console.log('✓ Ticketsnum tables checked/initialized.');
    } catch (err) {
        console.error('✗ Error initializing tables:', err);
    } finally {
        await pool.end();
    }
}

initPurchaseTickets();
