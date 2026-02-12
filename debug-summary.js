const pool = require('./src/config/database');

async function checkSummary() {
    try {
        // Fetch latest session
        const sessionRes = await pool.query('SELECT money FROM receipts ORDER BY datenew DESC LIMIT 1');
        const moneyId = sessionRes.rows[0]?.money;
        console.log('Testing with Money ID:', moneyId);

        console.log('--- Checking Change Sum ---');
        const changeRes = await pool.query(
            `SELECT currency_id, SUM(change) as total_change 
             FROM receipts 
             WHERE money = $1 
             GROUP BY currency_id`,
            [moneyId]
        );
        console.log('Total Change:', changeRes.rows);

        console.log('--- Checking Movements Query ---');
        const moveRes = await pool.query(
            `SELECT cm.movement_type, cm.currency_id, SUM(cm.amount) as total
             FROM cash_movements cm
             WHERE cm.cash_register_id = (SELECT cash_register_id FROM receipts WHERE money = $1 LIMIT 1)
               AND cm.datenew >= (SELECT datenew FROM receipts WHERE money = $1 ORDER BY datenew ASC LIMIT 1)
             GROUP BY cm.movement_type, cm.currency_id`,
            [moneyId]
        );
        console.log('Movements:', moveRes.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

checkSummary();
