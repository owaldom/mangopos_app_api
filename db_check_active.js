const pool = require('./src/config/database');

async function check() {
    try {
        console.log('Finding active session...');
        const sessionRes = await pool.query('SELECT money FROM closedcash WHERE dateend IS NULL ORDER BY datestart DESC LIMIT 1');
        if (sessionRes.rows.length === 0) {
            console.log('No active session found.');
            return;
        }
        const moneyId = sessionRes.rows[0].money;
        console.log(`Active Session: ${moneyId}`);

        console.log('\nPayments in this session (via tickets join):');
        const res = await pool.query(`
            SELECT DISTINCT p.payment 
            FROM payments p 
            JOIN receipts r ON p.receipt = r.id 
            WHERE r.money = $1
        `, [moneyId]);
        console.table(res.rows);

        console.log('\nPayments Account in this session (via receipts join):');
        const res2 = await pool.query(`
            SELECT DISTINCT pa.payment 
            FROM payments_account pa 
            JOIN receipts r ON pa.receipt = r.id 
            WHERE r.money = $1
        `, [moneyId]);
        console.table(res2.rows);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
