const pool = require('../config/database');


const supplierController = {
    // Obtener todos los proveedores
    getAll: async (req, res) => {
        try {
            const { search, page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            let query = 'FROM thirdparties t WHERE t.visible = true';
            let params = [];
            let paramIdx = 1;

            if (search) {
                query += ` AND (t.name ILIKE $${paramIdx} OR t.cif ILIKE $${paramIdx})`;
                params.push(`%${search}%`);
                paramIdx++;
            }

            if (req.query.withBalanceOnly === 'true') {
                query += ' AND t.balance > 0';
            }

            // Count total
            const countResult = await pool.query(`SELECT COUNT(*) ${query}`, params);
            const total = parseInt(countResult.rows[0].count);

            // Fetch data
            const dataResult = await pool.query(
                `SELECT t.*, 
                (SELECT COALESCE(SUM(
                    CASE 
                        WHEN p.currency_id = 2 THEN p.total 
                        ELSE p.total / NULLIF(p.exchange_rate, 0) 
                    END
                ), 0) 
                 FROM paymentspurchase p 
                 JOIN ticketspurchase tp ON p.receipt = tp.id 
                 WHERE tp.supplier = t.id AND tp.tickettype = 2) as total_paid
                ${query} 
                ORDER BY t.name 
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
            res.status(500).json({ error: 'Error al obtener proveedores' });
        }
    },

    // Obtener proveedor por ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT t.*, 
                (SELECT COALESCE(SUM(
                    CASE 
                        WHEN p.currency_id = 2 THEN p.total 
                        ELSE p.total / NULLIF(p.exchange_rate, 0) 
                    END
                ), 0) 
                 FROM paymentspurchase p 
                 JOIN ticketspurchase tp ON p.receipt = tp.id 
                 WHERE tp.supplier = t.id AND tp.tickettype = 2) as total_paid
                FROM thirdparties t 
                WHERE t.id = $1`;
            const result = await pool.query(query, [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Proveedor no encontrado' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener proveedor' });
        }
    },

    // Crear proveedor
    create: async (req, res) => {
        try {
            const {
                cif,
                name,
                address,
                contactcomm,
                contactfact,
                payrule,
                faxnumber,
                phonecomm,
                phonefact,
                email,
                webpage,
                notes,
                creditdays,
                creditlimit,
                persontype,
                typesupplier
            } = req.body;

            const result = await pool.query(
                `INSERT INTO thirdparties (
                    cif, name, address, contactcomm, contactfact, payrule, faxnumber, 
                    phonecomm, phonefact, email, webpage, notes, creditdays, creditlimit, 
                    persontype, typesupplier, visible, curdate, balance
                )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, NOW(), 0)
                 RETURNING *`,
                [
                    cif, name, address, contactcomm, contactfact, payrule, faxnumber,
                    phonecomm, phonefact, email, webpage, notes, creditdays || 0, creditlimit || 0,
                    persontype, typesupplier
                ]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23505') {
                return res.status(400).json({ error: 'El RIF ya existe' });
            }
            res.status(500).json({ error: 'Error al crear proveedor: ' + err.message });
        }
    },

    // Actualizar proveedor
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                cif,
                name,
                address,
                contactcomm,
                contactfact,
                payrule,
                faxnumber,
                phonecomm,
                phonefact,
                email,
                webpage,
                notes,
                creditdays,
                creditlimit,
                persontype,
                typesupplier,
                visible
            } = req.body;

            const result = await pool.query(
                `UPDATE thirdparties 
                 SET cif = $1, name = $2, address = $3, contactcomm = $4, contactfact = $5,
                     payrule = $6, faxnumber = $7, phonecomm = $8, phonefact = $9, email = $10,
                     webpage = $11, notes = $12, creditdays = $13, creditlimit = $14,
                     persontype = $15, typesupplier = $16, visible = $17
                 WHERE id = $18 RETURNING *`,
                [
                    cif, name, address, contactcomm, contactfact, payrule, faxnumber,
                    phonecomm, phonefact, email, webpage, notes, creditdays, creditlimit,
                    persontype, typesupplier, visible !== undefined ? visible : true, id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Proveedor no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar proveedor' });
        }
    },

    // Eliminar (Soft delete)
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('UPDATE thirdparties SET visible = false WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Proveedor no encontrado' });
            }
            res.json({ message: 'Proveedor desactivado' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar proveedor' });
        }
    },

    // Obtener facturas con saldo de un proveedor
    getInvoices: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT 
                    (T.ticketid || ' - ' || to_char(R.datenew, 'DD/MM/YYYY')) AS "dateInvoices", 
                    T.ticketid AS "numberInvoice", 
                    T.supplier, 
                    SUM(
                        CASE 
                            WHEN PP.currency_id = 2 THEN PP.total 
                            ELSE PP.total / NULLIF(PP.exchange_rate, 0)
                        END
                    ) AS balance,
                    ABS(SUM(
                        CASE 
                            WHEN PP.total < 0 THEN 
                                (CASE 
                                    WHEN PP.currency_id = 2 THEN PP.total 
                                    ELSE PP.total / NULLIF(PP.exchange_rate, 0)
                                END)
                            ELSE 0 
                        END
                    )) AS paid
                FROM paymentspurchase_account PP
                JOIN ticketspurchase T ON PP.receipt = T.id
                JOIN receiptspurchase R ON R.id = T.id
                WHERE T.tickettype = 0
                AND T.supplier = $1
                GROUP BY T.ticketid, T.supplier, R.datenew
                HAVING SUM(
                    CASE 
                        WHEN PP.currency_id = 2 THEN PP.total 
                        ELSE PP.total / NULLIF(PP.exchange_rate, 0)
                    END
                ) > 0.01
                ORDER BY T.ticketid
            `;
            const result = await pool.query(query, [id]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener facturas del proveedor' });
        }
    },

    // Obtener historial de pagos de un proveedor
    getPaymentHistory: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT 
                    p.datenew as date,
                    t.ticketid as "ticketNumber",
                    p.payment as method,
                    p.total as amount_original,
                    CASE 
                        WHEN p.currency_id = 2 THEN p.total 
                        ELSE p.total / NULLIF(p.exchange_rate, 0)
                    END as "amountUSD",
                    CASE 
                        WHEN p.currency_id = 2 THEN p.total * p.exchange_rate
                        ELSE p.total
                    END as "amountBs",
                    p.exchange_rate as "exchangeRate",
                    COALESCE(b.name, p.bank) as bank,
                    p.numdocument as cedula,
                    p.transid as reference,
                    (
                        SELECT t_inv.ticketid 
                        FROM paymentspurchase_account pa 
                        JOIN ticketspurchase t_inv ON pa.receipt = t_inv.id 
                        WHERE pa.concepto = 'Abono Ticket #' || t.ticketid
                        LIMIT 1
                    ) as "invoicePaid"
                FROM paymentspurchase p
                JOIN receiptspurchase r ON p.receipt = r.id
                JOIN ticketspurchase t ON t.id = r.id
                LEFT JOIN banks b ON p.bank_id = b.id
                WHERE t.supplier = $1 AND t.tickettype = 2
                ORDER BY p.datenew DESC
            `;
            const result = await pool.query(query, [id]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener historial de pagos del proveedor' });
        }
    }
};

module.exports = supplierController;
