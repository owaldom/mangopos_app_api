const pool = require('../config/database');
const crypto = require('crypto');

const customerController = {
    // Obtener todos los clientes (con búsqueda opcional)
    getAll: async (req, res) => {
        try {
            const { search, withDebtOnly, page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            let query = 'FROM customers c WHERE c.visible = true';
            let params = [];
            let paramIdx = 1;

            if (search) {
                query += ` AND (c.name ILIKE $${paramIdx} OR c.taxid ILIKE $${paramIdx} OR c.searchkey ILIKE $${paramIdx})`;
                params.push(`%${search}%`);
                paramIdx++;
            }

            if (withDebtOnly === 'true') {
                query += ' AND c.curdebt > 0';
            }

            // Count total
            const countResult = await pool.query(`SELECT COUNT(*) ${query}`, params);
            const total = parseInt(countResult.rows[0].count);

            // Fetch data with total_paid on open invoices calculation
            const dataResult = await pool.query(
                `SELECT c.*, 
                    COALESCE((
                        SELECT ABS(SUM(pa.total / COALESCE(pa.exchange_rate, 1)))
                        FROM payments_account pa
                        JOIN tickets t ON pa.receipt = t.id
                        WHERE t.customer = c.id 
                        AND t.tickettype = 0 
                        AND pa.total < 0
                        AND t.id IN (
                            SELECT pa2.receipt 
                            FROM payments_account pa2 
                            GROUP BY pa2.receipt 
                            HAVING SUM(pa2.total / COALESCE(pa2.exchange_rate, 1)) > 0.01
                        )
                    ), 0) as total_paid
                 ${query} 
                 ORDER BY name 
                 LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
                [...params, limit, offset]
            );

            res.json({
                data: dataResult.rows,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener clientes' });
        }
    },

    // Obtener un cliente por ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener cliente' });
        }
    },

    // Crear un nuevo cliente
    create: async (req, res) => {
        try {
            const {
                taxid,
                searchkey,
                name,
                email,
                phone,
                address,
                firstname,
                lastname,
                notes,
                maxdebt,
                discountcategory
            } = req.body;

            const finalSearchKey = searchkey || taxid || name;

            const result = await pool.query(
                `INSERT INTO customers (taxid, searchkey, name, email, phone, address, firstname, lastname, notes, visible, curdate, curdebt, maxdebt, discountcategory)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), 0, $10, $11)
                 RETURNING *`,
                [taxid, finalSearchKey, name, email, phone, address, firstname, lastname, notes, maxdebt || 0, discountcategory || null]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23505') { // Unique violation
                return res.status(400).json({ error: 'El ID de impuesto o clave de búsqueda ya existe' });
            }
            res.status(500).json({ error: 'Error al crear cliente' });
        }
    },

    // Actualizar un cliente
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                taxid,
                searchkey,
                name,
                email,
                phone,
                address,
                firstname,
                lastname,
                notes,
                visible,
                maxdebt,
                discountcategory
            } = req.body;

            const result = await pool.query(
                `UPDATE customers 
                 SET taxid = $1, searchkey = $2, name = $3, email = $4, phone = $5, address = $6, firstname = $7, lastname = $8, notes = $9, visible = $10, maxdebt = $11, discountcategory = $12
                 WHERE id = $13 RETURNING *`,
                [taxid, searchkey, name, email, phone, address, firstname, lastname, notes, visible !== undefined ? visible : true, maxdebt || 0, discountcategory || null, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar cliente' });
        }
    },

    // Obtener facturas con saldo de un cliente
    getInvoices: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT 
                    (T.ticketid || ' - ' || to_char(R.datenew, 'DD/MM/YYYY')) AS "dateInvoices", 
                    T.ticketid AS "numberInvoice", 
                    T.customer, 
                    SUM(PP.total / COALESCE(PP.exchange_rate, 1)) AS balance,
                    ABS(SUM(CASE WHEN PP.total < 0 THEN PP.total / COALESCE(PP.exchange_rate, 1) ELSE 0 END)) AS paid
                FROM payments_account PP
                JOIN tickets T ON PP.receipt = T.id
                JOIN receipts R ON T.id = R.id
                WHERE T.tickettype = 0
                AND T.customer = $1
                GROUP BY T.ticketid, T.customer, R.datenew
                HAVING SUM(PP.total / COALESCE(PP.exchange_rate, 1)) > 0.01
                ORDER BY T.ticketid
            `;
            const result = await pool.query(query, [id]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener facturas del cliente' });
        }
    },

    // Obtener historial de pagos de un cliente
    getPaymentHistory: async (req, res) => {
        try {
            const { id } = req.params;
            const { invoice, method, date } = req.query;

            let query = `
                SELECT 
                    p.datenew as date,
                    t.ticketid as "ticketNumber",
                    p.payment as method,
                    p.total as amount,
                    p.amount_base_currency as "amountBs",
                    p.exchange_rate as "exchangeRate",
                    COALESCE(b.name, p.bank) as bank,
                    p.numdocument as cedula,
                    p.transid as reference,
                    CASE 
                        WHEN r.currency_id = 2 THEN COALESCE(igtf_tax.amount * r.exchange_rate, 0)
                        ELSE COALESCE(igtf_tax.amount, 0)
                    END as "igtfAmount",
                    CASE 
                        WHEN r.currency_id = 2 THEN COALESCE(igtf_tax.amount, 0)
                        ELSE COALESCE(igtf_tax.amount / NULLIF(r.exchange_rate, 0), 0)
                    END as "igtfAmountUsd",
                    (
                        SELECT t_inv.ticketid 
                        FROM payments_account pa 
                        JOIN tickets t_inv ON pa.receipt = t_inv.id 
                        WHERE pa.concepto = 'Abono Ticket #' || t.ticketid
                        LIMIT 1
                    ) as "invoicePaid"
                FROM payments p
                JOIN receipts r ON p.receipt = r.id
                JOIN tickets t ON t.id = r.id
                LEFT JOIN banks b ON p.bank_id = b.id
                LEFT JOIN LATERAL (
                    SELECT tl.amount 
                    FROM taxlines tl
                    JOIN taxes tx ON tl.taxid = tx.id
                    WHERE tl.receipt = r.id AND tx.name ILIKE '%igtf%'
                    LIMIT 1
                ) igtf_tax ON true
                WHERE t.customer = $1 AND t.tickettype = 2
            `;

            const params = [id];
            let paramIdx = 2;

            if (invoice) {
                // Filter by invoice being paid (requires subquery match)
                query += ` AND EXISTS (
                    SELECT 1 
                    FROM payments_account pa 
                    JOIN tickets t_inv ON pa.receipt = t_inv.id 
                    WHERE pa.concepto = 'Abono Ticket #' || t.ticketid 
                    AND t_inv.ticketid::text LIKE $${paramIdx}
                )`;
                params.push(`%${invoice}%`);
                paramIdx++;
            }

            if (method) {
                query += ` AND p.payment = $${paramIdx}`;
                params.push(method);
                paramIdx++;
            }

            if (date) {
                // Assuming date is passing as YYYY-MM-DD
                query += ` AND DATE(p.datenew) = $${paramIdx}`;
                params.push(date);
                paramIdx++;
            }

            query += ` ORDER BY p.datenew DESC`;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener historial de pagos' });
        }
    }
};

module.exports = customerController;
