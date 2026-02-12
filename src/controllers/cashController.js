const pool = require('../config/database');
const crypto = require('crypto');

const formatDate = (dateInput) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    const pad = n => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const cashController = {
    // Obtener estado de la caja para un host
    getStatus: async (req, res) => {
        try {
            const { host } = req.query;
            if (!host) {
                return res.status(400).json({ error: 'Se requiere el parámetro host' });
            }

            const result = await pool.query(
                'SELECT * FROM closedcash WHERE host = $1 AND dateend IS NULL ORDER BY datestart DESC LIMIT 1',
                [host]
            );

            if (result.rows.length > 0) {
                const session = result.rows[0];
                const movements = await pool.query(
                    "SELECT amount, currency_id FROM cash_movements WHERE money = $1 AND concept LIKE 'Fondo de Apertura%'",
                    [session.money]
                );
                movements.rows.forEach(m => {
                    if (m.currency_id === 1) session.initial_balance = m.amount;
                    if (m.currency_id === 2) session.initial_balance_alt = m.amount;
                });
                res.json({ opened: true, session });
            } else {
                res.json({ opened: false });
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener estado de caja' });
        }
    },

    // Abrir caja
    openCash: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { host, cash_register_id, currency_id, initial_balance, initial_balance_alt } = req.body;
            if (!host) {
                return res.status(400).json({ error: 'Se requiere el host' });
            }

            // Verificar si ya hay una abierta
            const existing = await client.query(
                'SELECT id FROM closedcash WHERE host = $1 AND dateend IS NULL',
                [host]
            );

            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Ya existe una sesión de caja abierta para este host' });
            }

            // Obtener el siguiente hostsequence para este host
            const seqResult = await client.query(
                'SELECT COALESCE(MAX(hostsequence), 0) + 1 as nextseq FROM closedcash WHERE host = $1',
                [host]
            );
            const hostsequence = seqResult.rows[0].nextseq;

            const moneyId = crypto.randomUUID();
            const result = await client.query(
                `INSERT INTO closedcash (money, host, hostsequence, cash_register_id, currency_id, datestart)
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
                [moneyId, host, hostsequence, cash_register_id || 1, currency_id || 1]
            );

            // Registrar movimientos iniciales
            // Base (Bs)
            if (initial_balance && parseFloat(initial_balance) > 0) {
                await client.query(
                    `INSERT INTO cash_movements (datenew, money, movement_type, amount, currency_id, concept, person)
                     VALUES (NOW(), $1, 'IN', $2, 1, 'Fondo de Apertura', NULL)`,
                    [moneyId, initial_balance]
                );
            }

            // Alt (USD)
            if (initial_balance_alt && parseFloat(initial_balance_alt) > 0) {
                await client.query(
                    `INSERT INTO cash_movements (datenew, money, movement_type, amount, currency_id, concept, person)
                     VALUES (NOW(), $1, 'IN', $2, 2, 'Fondo de Apertura USD', NULL)`,
                    [moneyId, initial_balance_alt]
                );
            }

            await client.query('COMMIT');
            const sessionData = result.rows[0];
            sessionData.initial_balance = initial_balance || 0;
            sessionData.initial_balance_alt = initial_balance_alt || 0;
            res.status(201).json(sessionData);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al abrir caja' });
        } finally {
            client.release();
        }
    },

    // Cerrar caja
    closeCash: async (req, res) => {
        try {
            const { moneyId } = req.body;
            if (!moneyId) {
                return res.status(400).json({ error: 'Se requiere el moneyId' });
            }

            const result = await pool.query(
                'UPDATE closedcash SET dateend = NOW() WHERE money = $1 AND dateend IS NULL RETURNING *',
                [moneyId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No se encontró una sesión abierta con ese ID' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al cerrar caja' });
        }
    },

    // Obtener resumen detallado de una sesión
    getSummary: async (req, res) => {
        try {
            const { moneyId } = req.params;

            // 1. Resumen de Pagos por método y moneda (Ventas de Productos - tickettype 0)
            const paymentsResult = await pool.query(
                `SELECT p.payment, SUM(p.total) as total, SUM(p.amount_base_currency) as total_base, p.currency_id, COALESCE(c.symbol, '$') as symbol
                 FROM payments p
                 JOIN receipts r ON p.receipt = r.id
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 0 AND p.currency_id = 2
                 GROUP BY p.payment, p.currency_id, c.symbol
                 UNION ALL
                 SELECT 
                    p.payment, 
                    SUM(p.amount_base_currency) as total, 
                    SUM(p.amount_base_currency) as total_base,
                    p.currency_id, 
                    COALESCE(c.symbol, '$') as symbol
                 FROM payments p
                 JOIN receipts r ON p.receipt = r.id
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 0 AND p.currency_id = 1
                 GROUP BY p.payment, p.currency_id, c.symbol
                 ORDER BY payment`,
                [moneyId]
            );
            // 1b. Resumen de Cobros de Deuda / CxC (Abonos - tickettype 2)
            const cxcResult = await pool.query(
                `SELECT p.payment, SUM(p.total) as total, SUM(p.amount_base_currency) as total_base, p.currency_id, COALESCE(c.symbol, '$') as symbol
                 FROM payments p
                 JOIN receipts r ON p.receipt = r.id
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 2 AND p.currency_id = 2
                 GROUP BY p.payment, p.currency_id, c.symbol
                 UNION ALL
                 SELECT p.payment, SUM(p.amount_base_currency) as total, SUM(p.amount_base_currency) as total_base, p.currency_id, COALESCE(c.symbol, '$') as symbol
                 FROM payments p
                 JOIN receipts r ON p.receipt = r.id
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 2 AND p.currency_id = 1
                 GROUP BY p.payment, p.currency_id, c.symbol
                 ORDER BY payment`,
                [moneyId]
            );

            // 1c. Resumen de Compras al Contado (ticketspurchase tickettype 0)
            const purchaseResult = await pool.query(
                `SELECT p.payment, SUM(p.total) as total, p.currency_id, COALESCE(c.symbol, '$') as symbol
                 FROM paymentspurchase p
                 JOIN receiptspurchase r ON p.receipt = r.id
                 JOIN ticketspurchase t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 0 AND p.currency_id = 2
                 GROUP BY p.payment, p.currency_id, c.symbol
                 UNION ALL
                 SELECT p.payment, SUM(p.amount_base_currency) as total, p.currency_id, COALESCE(c.symbol, '$') as symbol
                 FROM paymentspurchase p
                 JOIN receiptspurchase r ON p.receipt = r.id
                 JOIN ticketspurchase t ON r.id = t.id
                 LEFT JOIN currencies c ON p.currency_id = c.id
                 WHERE r.money = $1 AND t.tickettype = 0 AND p.currency_id = 1
                 GROUP BY p.payment, p.currency_id, c.symbol
                 ORDER BY payment`,
                [moneyId]
            );


            // 2. Resumen de Ventas (Subtotal e Impuestos desde taxlines de tickettype 0)
            const salesResult = await pool.query(
                `SELECT 
                    r.currency_id,
                    COUNT(DISTINCT r.id) as ticket_count,
                    COALESCE(SUM(tl.base), 0) as subtotal,
                    COALESCE(SUM(tl.amount), 0) as taxes,
                    COALESCE(SUM(tl.base + tl.amount), 0) as total
                 FROM receipts r
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN taxlines tl ON r.id = tl.receipt
                 WHERE r.money = $1 AND t.tickettype = 0
                 GROUP BY r.currency_id`,
                [moneyId]
            );

            // 2b. Resumen Total en Base (VES) para compatibilidad o referencia rápida
            const salesTotalResult = await pool.query(
                `SELECT 
                    COALESCE(SUM(CASE WHEN r.currency_id = 2 THEN tl.base * r.exchange_rate ELSE tl.base END), 0) as subtotal,
                    COALESCE(SUM(CASE WHEN r.currency_id = 2 THEN tl.amount * r.exchange_rate ELSE tl.amount END), 0) as taxes,
                    COALESCE(SUM(CASE WHEN r.currency_id = 2 THEN (tl.base + tl.amount) * r.exchange_rate ELSE (tl.base + tl.amount) END), 0) as total
                 FROM receipts r
                 JOIN tickets t ON r.id = t.id
                 LEFT JOIN taxlines tl ON r.id = tl.receipt
                 WHERE r.money = $1 AND t.tickettype = 0`,
                [moneyId]
            );

            // 3. Resumen de Movimientos            // 3. Movimientos de Caja
            const movementsResult = await pool.query(
                `SELECT cm.movement_type, cm.currency_id, SUM(cm.amount) as total, COALESCE(c.symbol, '$') as symbol
                 FROM cash_movements cm
                 LEFT JOIN currencies c ON cm.currency_id = c.id
                 WHERE cm.money = $1
                 GROUP BY cm.movement_type, cm.currency_id, c.symbol`,
                [moneyId]
            );

            // 4. Calcular Vueltos (Change) para restarlos del efectivo
            const changeResult = await pool.query(
                `SELECT currency_id, SUM(change) as total_change
                 FROM receipts
                 WHERE money = $1 AND change > 0
                 GROUP BY currency_id`,
                [moneyId]
            );

            // Integrar vueltos como movimientos de SALIDA virtuales
            const movements = movementsResult.rows;
            changeResult.rows.forEach(row => {
                movements.push({
                    movement_type: 'OUT',
                    total: parseFloat(row.total_change),
                    currency_id: row.currency_id,
                    symbol: row.currency_id === 1 ? 'Bs.' : '$',
                    is_change: true // Marker for frontend if needed
                });
            });

            res.json({
                payments: paymentsResult.rows || [],
                cxcPayments: cxcResult.rows || [],
                purchasePayments: purchaseResult.rows || [],
                sales: salesTotalResult.rows[0] || { subtotal: 0, taxes: 0, total: 0 },
                salesByCurrency: salesResult.rows || [],
                movements: movementsResult.rows || []
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener resumen de caja' });
        }
    },

    // Obtener movimientos de caja
    getCashMovements: async (req, res) => {
        try {
            const { page = 1, limit = 50, startDate, endDate, moneyId, movementType, currencyId } = req.query;
            const offset = (page - 1) * limit;

            let query = `
                SELECT 
                    cm.id, cm.datenew, cm.money, cm.movement_type, cm.amount, 
                    cm.currency_id, cm.concept, cm.person,
                    c.symbol as currency_symbol,
                    p.name as person_name,
                    cc.host, cc.hostsequence
                FROM cash_movements cm
                LEFT JOIN currencies c ON cm.currency_id = c.id
                LEFT JOIN people p ON cm.person = p.id::text
                LEFT JOIN closedcash cc ON cm.money = cc.money
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 1;

            if (startDate) {
                query += ` AND cm.datenew >= $${paramCount}`;
                params.push(startDate);
                paramCount++;
            }

            if (endDate) {
                query += ` AND cm.datenew <= $${paramCount}`;
                params.push(endDate);
                paramCount++;
            }

            if (moneyId) {
                query += ` AND cm.money = $${paramCount}`;
                params.push(moneyId);
                paramCount++;
            }

            if (movementType) {
                query += ` AND cm.movement_type = $${paramCount}`;
                params.push(movementType);
                paramCount++;
            }

            if (currencyId) {
                query += ` AND cm.currency_id = $${paramCount}`;
                params.push(currencyId);
                paramCount++;
            }

            query += ` ORDER BY cm.datenew DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await pool.query(query, params);

            // Count total
            let countQuery = 'SELECT COUNT(*) FROM cash_movements cm WHERE 1=1';
            const countParams = [];
            let countParamCount = 1;

            if (startDate) {
                countQuery += ` AND cm.datenew >= $${countParamCount}`;
                countParams.push(startDate);
                countParamCount++;
            }
            if (endDate) {
                countQuery += ` AND cm.datenew <= $${countParamCount}`;
                countParams.push(endDate);
                countParamCount++;
            }
            if (moneyId) {
                countQuery += ` AND cm.money = $${countParamCount}`;
                countParams.push(moneyId);
                countParamCount++;
            }
            if (movementType) {
                countQuery += ` AND cm.movement_type = $${countParamCount}`;
                countParams.push(movementType);
                countParamCount++;
            }
            if (currencyId) {
                countQuery += ` AND cm.currency_id = $${countParamCount}`;
                countParams.push(currencyId);
                countParamCount++;
            }

            const countResult = await pool.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].count);

            res.json({
                data: result.rows,
                total: total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener movimientos de caja' });
        }
    },

    // Crear movimiento de caja
    createCashMovement: async (req, res) => {
        try {
            const { date, moneyId, movementType, amount, currencyId, concept, person } = req.body;

            if (!movementType || !amount) {
                return res.status(400).json({ error: 'Se requieren tipo de movimiento y monto' });
            }

            if (!['IN', 'OUT'].includes(movementType)) {
                return res.status(400).json({ error: 'Tipo de movimiento inválido. Debe ser IN o OUT' });
            }

            const result = await pool.query(
                `INSERT INTO cash_movements (datenew, money, movement_type, amount, currency_id, concept, person)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [formatDate(date), moneyId, movementType, amount, currencyId || 1, concept || '', person]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear movimiento de caja: ' + err.message });
        }
    }
};

module.exports = cashController;
