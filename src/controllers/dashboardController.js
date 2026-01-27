const pool = require('../config/database');

const dashboardController = {
    getStats: async (req, res) => {
        try {
            // 1. Transactions Today (Ventas y Cobros CxC)
            const txResult = await pool.query(`
                SELECT COUNT(*) as count 
                FROM receipts r 
                JOIN tickets t ON r.id = t.id
                WHERE date(r.datenew) = CURRENT_DATE AND t.tickettype IN (0, 2)
            `);
            const txToday = parseInt(txResult.rows[0].count);

            // 2. Sales Today (USD/Base and Bs) - Incluye Ventas (0) y Cobros CxC (2)
            const salesResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(p.amount_base_currency / r.exchange_rate), 0) as total_usd,
                    COALESCE(SUM(p.amount_base_currency), 0) as total_bs
                FROM payments p
                JOIN receipts r ON p.receipt = r.id
                JOIN tickets t ON r.id = t.id
                WHERE date(r.datenew) = CURRENT_DATE AND t.tickettype IN (0, 2)
            `);

            // Note: We use the sum of payments for "Sales Today" as it represents the actual money collected.
            const salesTodayUSD = parseFloat(salesResult.rows[0].total_usd);
            const salesTodayBs = parseFloat(salesResult.rows[0].total_bs);

            // 3. Open Registers
            const registersResult = await pool.query(`
                SELECT COUNT(*) as count 
                FROM closedcash 
                WHERE dateend IS NULL
            `);
            const openRegisters = parseInt(registersResult.rows[0].count);

            // 4. Low Stock (assuming threshold < 10 for now)
            const lowStockResult = await pool.query(`
                SELECT COUNT(*) as count 
                FROM stockcurrent 
                WHERE units < 10
            `);
            const lowStock = parseInt(lowStockResult.rows[0].count);

            res.json({
                salesToday: {
                    usd: salesTodayUSD,
                    bs: salesTodayBs
                },
                transactionsToday: txToday,
                openRegisters: openRegisters,
                lowStock: lowStock
            });

        } catch (err) {
            console.error('Error getting dashboard stats:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas del dashboard' });
        }
    },

    getRecentSales: async (req, res) => {
        try {
            // Last 5 sales
            const query = `
                SELECT 
                    t.id,
                    t.ticketid as ticket_number,
                    c.name as customer_name,
                    r.datenew as date,
                    t.status,
                    t.tickettype,
                    r.exchange_rate,
                    (
                        SELECT COALESCE(SUM(p.amount_base_currency / r.exchange_rate), 0) 
                        FROM payments p WHERE p.receipt = r.id
                    ) as total
                FROM tickets t
                INNER JOIN receipts r ON t.id = r.id
                LEFT JOIN customers c ON t.customer = c.id
                WHERE t.tickettype IN (0, 2)
                ORDER BY r.datenew DESC
                LIMIT 50
            `;

            const result = await pool.query(query);

            res.json(result.rows);

        } catch (err) {
            console.error('Error getting recent sales:', err);
            res.status(500).json({ error: 'Error al obtener ventas recientes' });
        }
    }
};

module.exports = dashboardController;
