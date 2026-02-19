const pool = require('./src/config/database');

async function checkSchema() {
    try {
        console.log('--- TICKETS SCHEMA ---');
        const ticketsSchema = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tickets'
    `);
        ticketsSchema.rows.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));

        console.log('\n--- PAYMENTS_ACCOUNT SCHEMA ---');
        const paSchema = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'payments_account'
    `);
        paSchema.rows.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));

        console.log('\n--- CHECKING TICKETS DATA ---');
        const sample = await pool.query('SELECT ticketid FROM tickets LIMIT 1');
        if (sample.rows.length > 0) {
            console.log('Sample ticketid type:', typeof sample.rows[0].ticketid, sample.rows[0].ticketid);
        }

    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
