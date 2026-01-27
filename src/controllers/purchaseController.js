const pool = require('../config/database');
const crypto = require('crypto');

const purchaseController = {
    // Obtener historial de compras con filtros
    getPurchaseHistory: async (req, res) => {
        try {
            const {
                startDate,
                endDate,
                supplierId,
                personId,
                ticketNumber,
                minTotal,
                maxTotal,
                page = 1,
                limit = 50
            } = req.query;

            let query = `
                SELECT 
                    t.id,
                    t.ticketid as ticket_number,
                    t.tickettype,
                    r.datenew as date,
                    tp.name as supplier_name,
                    tp.id as supplier_id,
                    p.name as person_name,
                    t.numberinvoice,
                    t.numbercontrol,
                    t.dateinvoice,
                    (SELECT COALESCE(SUM(pay.amount_base_currency / r.exchange_rate), 0) FROM paymentspurchase pay WHERE pay.receipt = r.id) as total
                FROM ticketspurchase t
                INNER JOIN receiptspurchase r ON t.id = r.id
                LEFT JOIN thirdparties tp ON t.supplier = tp.id
                LEFT JOIN people p ON t.person = p.id
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 1;

            if (startDate) {
                query += ` AND r.datenew >= $${paramCount}`;
                params.push(startDate);
                paramCount++;
            }
            if (endDate) {
                query += ` AND r.datenew <= $${paramCount}`;
                params.push(endDate);
                paramCount++;
            }
            if (supplierId) {
                query += ` AND t.supplier = $${paramCount}`;
                params.push(supplierId);
                paramCount++;
            }
            if (personId) {
                query += ` AND t.person = $${paramCount}`;
                params.push(personId);
                paramCount++;
            }
            if (ticketNumber) {
                query += ` AND t.ticketid = $${paramCount}`;
                params.push(ticketNumber);
                paramCount++;
            }

            const totalInBs = `((SELECT COALESCE(SUM(pay.amount_base_currency), 0) FROM paymentspurchase pay WHERE pay.receipt = r.id))`;
            if (minTotal) {
                query += ` AND ${totalInBs} >= $${paramCount}`;
                params.push(parseFloat(minTotal));
                paramCount++;
            }
            if (maxTotal) {
                query += ` AND ${totalInBs} <= $${paramCount}`;
                params.push(parseFloat(maxTotal));
                paramCount++;
            }

            query += ` ORDER BY r.datenew DESC`;

            // Pagination
            const offset = (page - 1) * limit;
            query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await pool.query(query, params);

            // Count total for pagination
            const countQuery = `
                SELECT COUNT(*) as total
                FROM ticketspurchase t
                INNER JOIN receiptspurchase r ON t.id = r.id
                WHERE 1=1
                ${startDate ? " AND r.datenew >= '" + startDate + "'" : ""}
                ${endDate ? " AND r.datenew <= '" + endDate + "'" : ""}
                ${supplierId ? " AND t.supplier = " + supplierId : ""}
                ${personId ? " AND t.person = " + personId : ""}
                ${ticketNumber ? " AND t.ticketid = " + ticketNumber : ""}
            `;
            const countResult = await pool.query(countQuery);

            res.json({
                purchases: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].total),
                    totalPages: Math.ceil(countResult.rows[0].total / limit)
                }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener historial de compras' });
        }
    },

    // Obtener detalles de una compra
    getPurchaseById: async (req, res) => {
        try {
            const { id } = req.params;

            const purchaseQuery = `
                SELECT 
                    t.id,
                    t.ticketid as ticket_number,
                    t.tickettype,
                    r.datenew as date,
                    tp.id as supplier_id,
                    tp.name as supplier_name,
                    tp.cif as supplier_taxid,
                    p.name as person_name,
                    t.numberinvoice,
                    t.numbercontrol,
                    t.dateinvoice,
                    t.notes,
                    r.money,
                    r.currency_id,
                    r.exchange_rate,
                    (SELECT COALESCE(SUM(pay.total), 0) FROM paymentspurchase pay WHERE pay.receipt = r.id) as total
                FROM ticketspurchase t
                INNER JOIN receiptspurchase r ON t.id = r.id
                LEFT JOIN thirdparties tp ON t.supplier = tp.id
                LEFT JOIN people p ON t.person = p.id
                WHERE t.id = $1
            `;
            const purchaseResult = await pool.query(purchaseQuery, [id]);

            if (purchaseResult.rows.length === 0) {
                return res.status(404).json({ error: 'Compra no encontrada' });
            }

            const purchase = purchaseResult.rows[0];

            // Lines
            const linesQuery = `
                SELECT 
                    tl.line,
                    tl.product as product_id,
                    pr.name as product_name,
                    pr.reference as product_reference,
                    tl.units,
                    tl.price,
                    tl.taxid,
                    tl.discountvalue,
                    (tl.units * tl.price) as subtotal
                FROM ticketlinespurchase tl
                LEFT JOIN products pr ON tl.product = pr.id
                WHERE tl.ticket = $1
                ORDER BY tl.line
            `;
            const linesResult = await pool.query(linesQuery, [id]);

            // Payments
            const paymentsQuery = `
                SELECT payment, total, currency_id, exchange_rate, amount_base_currency, bank, numdocument, transid as reference
                FROM paymentspurchase
                WHERE receipt = $1
            `;
            const paymentsResult = await pool.query(paymentsQuery, [id]);

            // Taxes
            const taxesQuery = `
                SELECT taxid, percentage, base, amount
                FROM taxlinespurchase
                WHERE receipt = $1
            `;
            const taxesResult = await pool.query(taxesQuery, [id]);

            res.json({
                ...purchase,
                lines: linesResult.rows,
                payments: paymentsResult.rows,
                taxes: taxesResult.rows
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener detalles de la compra' });
        }
    },

    // Crear una compra
    createPurchase: async (req, res) => {
        const client = await pool.connect();
        try {
            const {
                supplier_id,
                person_id,
                lines,
                payments,
                total,
                cash_register_id,
                currency_id,
                exchange_rate,
                money_id,
                number_invoice,
                number_control,
                date_invoice,
                notes,
                ticket_type = 0, // 0 = Receipt, 1 = Refund
                global_discount = 0 // percentage (0-1)
            } = req.body;

            await client.query('BEGIN');

            // VALIDACIÓN: Solo productos con iscom = true son comprables
            for (const line of lines) {
                if (line.product_id) {
                    const prodRes = await client.query('SELECT name, iscom FROM products WHERE id = $1', [line.product_id]);
                    if (prodRes.rows.length === 0) throw new Error(`Producto con ID ${line.product_id} no encontrado.`);
                    if (!prodRes.rows[0].iscom) {
                        throw new Error(`El producto "${prodRes.rows[0].name}" no está marcado como comprable.`);
                    }
                }
            }

            // 1. Correlativo
            let ticketsnumTable = 'ticketsnum_purchase';
            if (ticket_type === 1) ticketsnumTable = 'ticketsnum_refund_purchase';

            const ticketNumRes = await client.query(`UPDATE ${ticketsnumTable} SET id = id + 1 RETURNING id`);
            const ticketNumber = ticketNumRes.rows[0].id;

            // 2. Receipt Purchase
            // attributes is bytea, we'll store null for now or a simple XML if needed
            const receiptRes = await client.query(
                `INSERT INTO receiptspurchase (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            // 3. Ticket Purchase
            await client.query(
                `INSERT INTO ticketspurchase (id, tickettype, ticketid, person, supplier, numberinvoice, numbercontrol, dateinvoice, notes, idlocation, discountname, discountvalue)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11)`,
                [receiptId, ticket_type, ticketNumber, person_id, supplier_id, number_invoice, number_control, date_invoice || new Date(), notes, global_discount > 0 ? 'Descuento Global' : null, global_discount]
            );

            // 4. Lines and Stock
            const taxSummary = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                await client.query(
                    `INSERT INTO ticketlinespurchase (ticket, line, product, units, price, taxid, discountvalue)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [receiptId, i, line.product_id, line.units, line.price, line.taxid, line.discount || 0]
                );

                // Tax Summary
                if (line.taxid) {
                    if (!taxSummary[line.taxid]) {
                        taxSummary[line.taxid] = { base: 0, amount: 0, rate: line.tax_rate || 0 };
                    }
                    // Apply line discount
                    const lineSubtotal = line.units * line.price;
                    const lineDiscount = lineSubtotal * (line.discount || 0);
                    const lineBase = lineSubtotal - lineDiscount;

                    // Apply proportion of global discount
                    const baseAfterGlobal = lineBase * (1 - global_discount);
                    const amount = baseAfterGlobal * (line.rate || line.tax_rate || 0);

                    taxSummary[line.taxid].base += baseAfterGlobal;
                    taxSummary[line.taxid].amount += amount;
                }

                // 5. Update Stock
                if (line.product_id) {
                    // Purchase reason is 1 (In)
                    const reason = ticket_type === 1 ? -2 : 1;
                    const unitsMovement = ticket_type === 1 ? -line.units : line.units;

                    await client.query(
                        `INSERT INTO stockcurrent (location, product, units)
                         VALUES (1, $1, $2)
                         ON CONFLICT (location, product, attributesetinstance_id) 
                         DO UPDATE SET units = stockcurrent.units + $2`,
                        [line.product_id, unitsMovement]
                    );

                    await client.query(
                        `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                         VALUES (NOW(), $1, 1, $2, $3, $4, $5)`,
                        [reason, line.product_id, unitsMovement, line.price, `Compra Ticket #${ticketNumber}${number_invoice ? ' Fact:' + number_invoice : ''}`]
                    );
                }
            }

            // 6. Taxlines Purchase
            for (const taxid in taxSummary) {
                const summary = taxSummary[taxid];
                await client.query(
                    `INSERT INTO taxlinespurchase (receipt, taxid, percentage, base, amount, datenew)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [receiptId, taxid, summary.rate, summary.base, summary.amount]
                );
            }

            // 6.1 Discountlines Purchase (Global)
            if (global_discount > 0) {
                const subtotalBeforeGlobal = lines.reduce((acc, l) => acc + (l.units * l.price * (1 - (l.discount || 0))), 0);
                const discountAmount = subtotalBeforeGlobal * global_discount;
                await client.query(
                    `INSERT INTO discountlinespurchase (id, receipt, discountid, percentage, base, amount, datenew)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                    [crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(16).toString('hex'), receiptId, '000', global_discount, subtotalBeforeGlobal, discountAmount]
                );
            }

            // 7. Payments
            for (const p of payments) {
                const paymentRes = await client.query(
                    `INSERT INTO paymentspurchase (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
                    [
                        receiptId,
                        p.method,
                        p.total,
                        p.currency_id || currency_id || 1,
                        p.exchange_rate || exchange_rate || 1.0,
                        p.amount_base || p.total,
                        p.bank || null,
                        p.numdocument || null,
                        p.reference || null
                    ]
                );

                // Debt Logic (CxP)
                if (p.method === 'debt' || p.method === 'Credito') {
                    if (!supplier_id) throw new Error('Debe seleccionar un proveedor para crédito.');

                    const systemExchangeRate = parseFloat(p.exchange_rate || exchange_rate || 1.0);
                    // Calculate amount in USD
                    // If payment is USD (2), amount is already USD.
                    // If payment is Bs (1), amount is Total / Rate.
                    const amountUSD = (p.currency_id === 2 || p.currency_id === '2')
                        ? parseFloat(p.total)
                        : (parseFloat(p.total) / systemExchangeRate);

                    // Update supplier balance (Add Debt in USD)
                    await client.query(
                        'UPDATE thirdparties SET balance = balance + $1, curdate = NOW() WHERE id = $2',
                        [amountUSD, supplier_id]
                    );

                    // Insert into paymentspurchase_account
                    await client.query(
                        `INSERT INTO paymentspurchase_account (receipt, payment, total, currency_id, exchange_rate, datenew, concepto, bank, numdocument)
                         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
                        [
                            receiptId,
                            p.method,
                            p.total,
                            p.currency_id || currency_id || 1,
                            p.exchange_rate || exchange_rate || 1.0,
                            `Compra a Crédito Ticket #${ticketNumber}`,
                            p.bank || 'CAJA',
                            p.numdocument || `PURCHASE-${ticketNumber}`
                        ]
                    );
                }
            }

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                ticketId: receiptId,
                ticketNumber: ticketNumber
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al procesar la compra: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Crear un abono/pago a deuda de proveedor
    createDebtPayment: async (req, res) => {
        const client = await pool.connect();
        try {
            const {
                supplier_id,
                person_id,
                payments, // Array of { method, total, bank, numdocument, invoice_number, currency_id, exchange_rate, amount_base }
                cash_register_id,
                currency_id,
                exchange_rate,
                money_id
            } = req.body;

            if (!supplier_id) {
                return res.status(400).json({ error: 'Debe proporcionar un ID de proveedor' });
            }

            await client.query('BEGIN');

            // 1. Correlativo
            const ticketNumRes = await client.query('UPDATE ticketsnum_payment_purchase SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            // 2. Receipt (Type 2 = RECEIPT_PAYMENT)
            const receiptRes = await client.query(
                `INSERT INTO receiptspurchase (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            // 3. Ticket
            await client.query(
                `INSERT INTO ticketspurchase (id, tickettype, ticketid, person, supplier, cash_register_id, currency_id)
                 VALUES ($1, 2, $2, $3, $4, $5, $6)`,
                [receiptId, ticketNumber, person_id, supplier_id, cash_register_id || null, currency_id || 1]
            );

            let totalPayedUSD = 0;

            // 4. Procesar Pagos
            for (const p of payments) {
                const currentCurrencyId = p.currency_id || currency_id || 1;
                const currentExchangeRate = parseFloat(p.exchange_rate || exchange_rate || 1.0);
                const currentAmountBase = p.amount_base || p.total;

                // Calculate USD Amount for this payment
                const amountUSD = (currentCurrencyId === 2 || currentCurrencyId === '2')
                    ? parseFloat(p.total)
                    : (parseFloat(p.total) / currentExchangeRate);

                // Insertar en PAYMENTS PURCHASE
                await client.query(
                    `INSERT INTO paymentspurchase (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
                    [
                        receiptId,
                        p.method,
                        p.total,
                        currentCurrencyId,
                        currentExchangeRate,
                        currentAmountBase,
                        p.bank || '',
                        p.numdocument || '',
                        p.reference || ''
                    ]
                );

                // Insertar en PAYMENTSPURCHASE_ACCOUNT (entrada negativa para la factura original si se especifica)
                if (p.invoice_number) {
                    const originalTicketRes = await client.query(
                        'SELECT id FROM ticketspurchase WHERE ticketid = $1 AND tickettype = 0',
                        [p.invoice_number]
                    );

                    if (originalTicketRes.rows.length > 0) {
                        const originalReceiptId = originalTicketRes.rows[0].id;
                        await client.query(
                            `INSERT INTO paymentspurchase_account (receipt, payment, total, currency_id, exchange_rate, datenew, concepto, bank, numdocument)
                             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
                            [
                                originalReceiptId,
                                p.method,
                                -p.total, // Negativo para reducir saldo
                                currentCurrencyId,
                                currentExchangeRate,
                                `Abono Ticket #${ticketNumber}`,
                                p.bank || '',
                                p.numdocument || ''
                            ]
                        );
                    }
                }

                totalPayedUSD += amountUSD;
            }

            // 5. Actualizar Saldo del Proveedor (CxP) (Restar USD)
            await client.query(
                'UPDATE thirdparties SET balance = balance - $1, curdate = NOW() WHERE id = $2',
                [totalPayedUSD, supplier_id]
            );

            await client.query('COMMIT');
            res.status(201).json({
                message: 'Pago procesado exitosamente',
                receiptId: receiptId,
                ticketNumber: ticketNumber
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('ERROR in createDebtPayment:', err);
            res.status(500).json({
                error: 'Error al procesar el pago de deuda de proveedor',
                details: err.message
            });
        } finally {
            client.release();
        }
    }
};

module.exports = purchaseController;
