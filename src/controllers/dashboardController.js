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
                LIMIT 20
            `;

            const result = await pool.query(query);

            res.json(result.rows);

        } catch (err) {
            console.error('Error getting recent sales:', err);
            res.status(500).json({ error: 'Error al obtener ventas recientes' });
        }
    },

    getAdvancedStats: async (req, res) => {
        try {
            // 1. Sales Trends (Last 30 days)
            const salesTrendsResult = await pool.query(`
                SELECT 
                    date(r.datenew) as date,
                    SUM(p.amount_base_currency / r.exchange_rate) as total_usd,
                    SUM(p.amount_base_currency) as total_bs
                FROM payments p
                JOIN receipts r ON p.receipt = r.id
                JOIN tickets t ON r.id = t.id
                WHERE r.datenew >= CURRENT_DATE - INTERVAL '30 days'
                  AND t.tickettype IN (0, 2)
                GROUP BY date(r.datenew)
                ORDER BY date(r.datenew) ASC
            `);

            // 2. Payment Distribution (Last 30 days)
            const paymentDistResult = await pool.query(`
                SELECT 
                    p.payment as method,
                    SUM(p.amount_base_currency / r.exchange_rate) as amount_usd,
                    SUM(p.amount_base_currency) as amount_bs
                FROM payments p
                JOIN receipts r ON p.receipt = r.id
                JOIN tickets t ON r.id = t.id
                WHERE r.datenew >= CURRENT_DATE - INTERVAL '30 days'
                  AND t.tickettype IN (0, 2)
                GROUP BY p.payment
            `);

            // 3. Inventory Health
            const invHealthResult = await pool.query(`
                SELECT 
                    COUNT(CASE WHEN units <= 0 THEN 1 END) as out_of_stock,
                    COUNT(CASE WHEN units > 0 AND units < 10 THEN 1 END) as low_stock,
                    COUNT(CASE WHEN units >= 10 THEN 1 END) as optimal,
                    SUM(units * pricebuy) as total_value_bs
                FROM stockcurrent sc
                JOIN products p ON sc.product = p.id
            `);

            // 4. Banks Summary
            const banksResult = await pool.query(`
                SELECT 
                    name,
                    current_balance as balance,
                    currency
                FROM banks
                WHERE active = true
            `);

            // 5. AR / AP
            const cxcResult = await pool.query('SELECT SUM(curdebt) as total_cxc, COUNT(*) as count FROM customers WHERE curdebt > 0');
            const cxpResult = await pool.query('SELECT SUM(balance) as total_cxp, COUNT(*) as count FROM thirdparties WHERE balance > 0 AND visible = true');

            // 6. Expenses (Last 30 days)
            const expensesResult = await pool.query(`
                SELECT 
                    g.name as category,
                    SUM(gd.total) as total_bs
                FROM gastos_diarios gd
                JOIN gastos g ON gd.idgastos = g.id
                WHERE gd.date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY g.name
                ORDER BY total_bs DESC
            `);

            // 7. Top 5 Products (Last 30 days)
            const topProductsResult = await pool.query(`
                SELECT 
                    p.name,
                    SUM(tl.units) as total_units,
                    SUM(tl.units * tl.price) as total_amount_bs
                FROM ticketlines tl
                JOIN products p ON tl.product = p.id
                JOIN receipts r ON tl.ticket = r.id
                JOIN tickets t ON r.id = t.id
                WHERE r.datenew >= CURRENT_DATE - INTERVAL '30 days'
                  AND t.tickettype IN (0, 2)
                GROUP BY p.name
                ORDER BY total_units DESC
                LIMIT 5
            `);

            res.json({
                sales: {
                    daily: salesTrendsResult.rows,
                    payments: paymentDistResult.rows,
                    topProducts: topProductsResult.rows
                },
                inventory: {
                    stockHealth: {
                        outOfStock: parseInt(invHealthResult.rows[0].out_of_stock),
                        lowStock: parseInt(invHealthResult.rows[0].low_stock),
                        optimal: parseInt(invHealthResult.rows[0].optimal)
                    },
                    totalValueBs: parseFloat(invHealthResult.rows[0].total_value_bs || 0)
                },
                banks: banksResult.rows,
                cxc: {
                    totalBs: parseFloat(cxcResult.rows[0].total_cxc || 0),
                    count: parseInt(cxcResult.rows[0].count)
                },
                cxp: {
                    totalBs: parseFloat(cxpResult.rows[0].total_cxp || 0),
                    count: parseInt(cxpResult.rows[0].count)
                },
                expenses: {
                    byCategory: expensesResult.rows,
                    totalBs: expensesResult.rows.reduce((sum, row) => sum + parseFloat(row.total_bs), 0)
                }
            });

        } catch (err) {
            console.error('Error getting advanced dashboard stats:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas avanzadas' });
        }
    }
};

module.exports = dashboardController;
