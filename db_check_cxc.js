const pool = require('./src/config/database');

async function check() {
    try {
        const out = {};
        const res = await pool.query(`
            SELECT t.id, t.ticketid, t.tickettype, r.money, r.datenew, 
                   (SELECT SUM(total) FROM payments WHERE receipt = t.id) as payment_total
            FROM tickets t
            JOIN receipts r ON t.id = r.id
            WHERE t.tickettype = 2
            ORDER BY r.datenew DESC
            LIMIT 5
        `);
        out.last_cxc_tickets = res.rows;

        const sessionRes = await pool.query(`
            SELECT money, host, hostsequence, datestart, dateend
            FROM closedcash
            WHERE dateend IS NULL
            ORDER BY datestart DESC
            LIMIT 1
        `);
        out.active_session = sessionRes.rows[0] || null;

        if (out.active_session) {
            const lastSessionMoney = out.active_session.money;
            const cxcMatchCount = await pool.query(`
                SELECT COUNT(*) 
                FROM tickets t
                JOIN receipts r ON t.id = r.id
                WHERE r.money = $1 AND t.tickettype = 2
            `, [lastSessionMoney]);
            out.cxc_in_session = parseInt(cxcMatchCount.rows[0].count);
        }

        console.log(JSON.stringify(out, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
