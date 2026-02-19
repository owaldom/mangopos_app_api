const pool = require('../config/database');

const salesController = {
    // Obtener catálogo (categorías y productos)
    getCatalog: async (req, res) => {
        try {
            const { locationId } = req.query;
            const locId = locationId || 1;

            const categoriesRes = await pool.query('SELECT id, name, parentid, image, visible_in_pos FROM categories WHERE visible_in_pos = true ORDER BY name');

            const productsRes = await pool.query(`
                SELECT p.id, p.reference, p.code, p.name, p.pricebuy, p.pricesell, p.category, p.taxcat, 
                       p.isscale, p.iscom, p.typeproduct, p.servicio, p.marketable, 
                       p.image,
                       COALESCE((SELECT t.rate FROM taxes t WHERE t.category = p.taxcat ORDER BY t.id LIMIT 1), 0) as tax_rate, 
                       COALESCE((SELECT t.id FROM taxes t WHERE t.category = p.taxcat ORDER BY t.id LIMIT 1), '000') as tax_id, 
                       EXISTS(SELECT 1 FROM products_cat WHERE product = p.id) as incatalog,
                       COALESCE(SUM(s.units), 0) as stock
                FROM products p
                LEFT JOIN stockcurrent s ON p.id = s.product AND s.location = $1
                WHERE p.marketable = true
                GROUP BY p.id, p.reference, p.code, p.name, p.pricebuy, p.pricesell, p.category, p.taxcat, 
                         p.isscale, p.iscom, p.typeproduct, p.servicio, p.marketable, p.image
                ORDER BY p.name
            `, [locId]);

            const categories = categoriesRes.rows.map(cat => ({
                ...cat,
                image: cat.image ? cat.image.toString('base64') : null
            }));

            const products = productsRes.rows.map(prod => ({
                ...prod,
                image: prod.image ? prod.image.toString('base64') : null
            }));

            res.json({
                categories: categories,
                products: products
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener el catálogo' });
        }
    },

    getCurrencies: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, code, name, symbol, exchange_rate, is_base FROM currencies WHERE active = true ORDER BY is_base DESC');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener monedas' });
        }
    },

    createSale: async (req, res) => {
        const client = await pool.connect();
        try {
            const {
                customer_id,
                person_id,
                lines,
                payments,
                total,
                cash_register_id,
                currency_id,
                exchange_rate,
                money_id,
                location_id,
                igtf_amount,
                igtf_amount_alt
            } = req.body;

            const locId = location_id || 1;

            await client.query('BEGIN');

            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            const receiptRes = await client.query(
                `INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew, change) 
                 VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING id`,
                [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0, req.body.change || 0]
            );
            const receiptId = receiptRes.rows[0].id;

            const ticketRes = await client.query(
                `INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status)
                 VALUES ($1, 0, $2, $3, $4, $5, $6, 0) RETURNING id`,
                [receiptId, ticketNumber, person_id, customer_id || null, cash_register_id || null, currency_id || 1]
            );

            const taxSummary = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                await client.query(
                    `INSERT INTO ticketlines (ticket, line, product, units, price, taxid, discountid)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [receiptId, i, line.product_id, line.units, line.price, line.taxid, line.discountid || '001']
                );

                if (!taxSummary[line.taxid]) {
                    taxSummary[line.taxid] = { base: 0, amount: 0, rate: parseFloat(line.tax_rate || 0) };
                }
                const base = parseFloat(line.units || 0) * parseFloat(line.price || 0);
                const amount = base * parseFloat(line.tax_rate || 0);
                taxSummary[line.taxid].base += base;
                taxSummary[line.taxid].amount += amount;

                if (line.product_id) {
                    const productCheck = await client.query(
                        'SELECT p.servicio, p.iscom, p.typeproduct FROM products p WHERE p.id = $1',
                        [line.product_id]
                    );

                    const isService = productCheck.rows.length > 0 && (
                        productCheck.rows[0].servicio === '1' ||
                        productCheck.rows[0].servicio === true ||
                        productCheck.rows[0].servicio === 'true'
                    );

                    const typeProduct = productCheck.rows[0]?.typeproduct;

                    if (!isService) {
                        if (typeProduct === 'CO') {
                            await processCompoundProductStock(client, line.product_id, line.units, line.price, ticketNumber, locId);
                        } else if (typeProduct === 'KI') {
                            await processKitStock(client, line.product_id, line.units, line.selectedComponents, ticketNumber, locId);
                        } else {
                            const stockRes = await client.query(
                                'SELECT SUM(units) as total FROM stockcurrent WHERE location = $1 AND product = $2',
                                [locId, line.product_id]
                            );
                            const currentStock = parseFloat(stockRes.rows[0]?.total || 0);

                            if (currentStock < line.units) {
                                throw new Error(`Stock insuficiente para el producto ${line.product_name || line.product_id}. Disponible: ${currentStock}, Requerido: ${line.units}`);
                            }

                            await client.query(
                                `INSERT INTO stockcurrent (location, product, units)
                                 VALUES ($1, $2, $3)
                                 ON CONFLICT (location, product, attributesetinstance_id) 
                                 DO UPDATE SET units = stockcurrent.units + $3`,
                                [locId, line.product_id, -line.units]
                            );

                            await client.query(
                                `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                                 VALUES (NOW(), -1, $1, $2, $3, $4, $5)`,
                                [locId, line.product_id, -line.units, line.price, `Venta Ticket #${ticketNumber}`]
                            );
                        }
                    }
                }
            }

            // 6. Insertar Taxlines (Resumen)
            for (const taxid in taxSummary) {
                const summary = taxSummary[taxid];
                await client.query(
                    `INSERT INTO taxlines (receipt, taxid, percentage, base, amount, datenew)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [receiptId, taxid, summary.rate, summary.base, summary.amount]
                );
            }

            // Recording IGTF if applicable
            if (igtf_amount > 0) {
                let igtfTaxId = null;
                const igtfTaxRes = await client.query("SELECT id FROM taxes WHERE name ILIKE '%igtf%' LIMIT 1");
                if (igtfTaxRes.rows.length > 0) {
                    igtfTaxId = igtfTaxRes.rows[0].id;
                } else {
                    const newIgtfTax = await client.query(
                        "INSERT INTO taxes (name, rate, validfrom, category) VALUES ('IGTF 3%', 0.03, NOW(), (SELECT id FROM taxcategories LIMIT 1)) RETURNING id"
                    );
                    igtfTaxId = newIgtfTax.rows[0].id;
                }

                await client.query(
                    `INSERT INTO taxlines (receipt, taxid, percentage, base, amount, datenew)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [receiptId, igtfTaxId, 0.03, (igtf_amount / 0.03), igtf_amount]
                );
            }

            // 7. Insertar Payments
            for (const p of payments) {
                const currentCurrencyId = p.currency_id || currency_id || 1;
                let currentExchangeRate = p.exchange_rate || exchange_rate || 1.0;
                let currentAmountBase = p.amount_base || p.total;

                if (currentCurrencyId === 2) {
                    currentAmountBase = p.total * (exchange_rate || 1.0);
                    currentExchangeRate = 1.0;
                }

                await client.query(
                    `INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid, bank_id, account_number, is_pago_movil)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12)`,
                    [
                        receiptId,
                        p.method,
                        p.total,
                        currentCurrencyId,
                        currentExchangeRate,
                        currentAmountBase,
                        p.bank || null,
                        p.cedula || null,
                        p.reference || null,
                        p.bank_id || null,
                        p.account_number || null,
                        p.is_pago_movil || false
                    ]
                );

                if (p.bank_id && ['card', 'paper', 'Debito', 'Credito', 'PagoMovil', 'transfer'].includes(p.method)) {
                    try {
                        const bankResult = await client.query('SELECT current_balance FROM banks WHERE id = $1', [p.bank_id]);
                        if (bankResult.rows.length > 0) {
                            const currentBalance = parseFloat(bankResult.rows[0].current_balance);
                            const transactionAmount = parseFloat(currentAmountBase);
                            const newBalance = currentBalance + transactionAmount;

                            await client.query(`
                                INSERT INTO bank_transactions (
                                    bank_id, transaction_type, amount, balance_after,
                                    reference_type, reference_id, payment_method, description
                                )
                                VALUES ($1, 'INCOME', $2, $3, 'SALE', $4, $5, $6)
                            `, [
                                p.bank_id,
                                transactionAmount,
                                newBalance,
                                receiptId,
                                p.method,
                                `Venta #${ticketNumber}`
                            ]);

                            await client.query(
                                'UPDATE banks SET current_balance = $1 WHERE id = $2',
                                [newBalance, p.bank_id]
                            );
                        }
                    } catch (bankError) {
                        console.error('Error creating bank transaction:', bankError);
                    }
                }

                if (p.method === 'debt' || p.method === 'Credito') {
                    if (!customer_id) {
                        throw new Error('Debe seleccionar un cliente para realizar una venta a crédito.');
                    }

                    const customerRes = await client.query(
                        'SELECT maxdebt, curdebt FROM customers WHERE id = $1 FOR UPDATE',
                        [customer_id]
                    );

                    if (customerRes.rows.length === 0) {
                        throw new Error('Cliente no encontrado.');
                    }

                    const { maxdebt, curdebt } = customerRes.rows[0];
                    const amountInUSD = currentCurrencyId === 2 ? p.total : (currentAmountBase / currentExchangeRate);
                    const newDebtUSD = parseFloat(curdebt || 0) + amountInUSD;

                    if (maxdebt > 0 && newDebtUSD > (parseFloat(maxdebt) + 0.01)) {
                        throw new Error(`Límite de crédito excedido. Límite: $ ${maxdebt}, Deuda actual + nueva (en USD): $ ${newDebtUSD.toFixed(2)}`);
                    }

                    await client.query(
                        'UPDATE customers SET curdebt = $1, curdate = NOW() WHERE id = $2',
                        [newDebtUSD, customer_id]
                    );

                    let debtExchangeRate = currentExchangeRate;
                    if (p.currency_id === 2) debtExchangeRate = 1.0;

                    await client.query(
                        `INSERT INTO payments_account (receipt, payment, total, currency_id, exchange_rate, datenew, concepto, bank, numdocument)
                         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
                        [
                            receiptId,
                            p.method,
                            p.total,
                            p.currency_id || currency_id || 1,
                            debtExchangeRate,
                            `Venta a Crédito Ticket #${ticketNumber}`,
                            p.bank || 'CAJA',
                            p.reference || p.cedula || `TICKET-${ticketNumber}`
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
            res.status(500).json({ error: 'Error al procesar la venta: ' + err.message });
        } finally {
            client.release();
        }
    },

    getSalesHistory: async (req, res) => {
        try {
            const {
                startDate,
                endDate,
                customerId,
                userId,
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
                    c.name as customer_name,
                    c.id as customer_id,
                    p.name as cashier_name,
                    t.status,
                    r.exchange_rate,
                    (SELECT COALESCE(SUM(pay.amount_base_currency / r.exchange_rate), 0) FROM payments pay WHERE pay.receipt = r.id) as total
                FROM tickets t
                INNER JOIN receipts r ON t.id = r.id
                LEFT JOIN customers c ON t.customer = c.id
                LEFT JOIN people p ON t.person = p.id
                WHERE t.tickettype IN (0, 1)
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

            if (customerId) {
                query += ` AND t.customer = $${paramCount}`;
                params.push(customerId);
                paramCount++;
            }

            if (userId) {
                query += ` AND t.person = $${paramCount}`;
                params.push(userId);
                paramCount++;
            }

            if (ticketNumber) {
                query += ` AND t.ticketid = $${paramCount}`;
                params.push(ticketNumber);
                paramCount++;
            }

            const havingConditions = [];
            const totalInBs = `((SELECT COALESCE(SUM(pay.total), 0) FROM payments pay WHERE pay.receipt = r.id) * COALESCE(r.exchange_rate, 1))`;

            if (minTotal) {
                havingConditions.push(`${totalInBs} >= ${parseFloat(minTotal)}`);
            }
            if (maxTotal) {
                havingConditions.push(`${totalInBs} <= ${parseFloat(maxTotal)}`);
            }
            if (havingConditions.length > 0) {
                query += ` HAVING ${havingConditions.join(' AND ')}`;
            }

            query += ` ORDER BY r.datenew DESC`;

            const offset = (page - 1) * limit;
            query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await pool.query(query, params);

            let countQuery = `
                SELECT COUNT(DISTINCT t.id) as total
                FROM tickets t
                INNER JOIN receipts r ON t.id = r.id
                LEFT JOIN customers c ON t.customer = c.id
                LEFT JOIN people p ON t.person = p.id
                WHERE 1=1
            `;
            const countParams = [];
            let countParamCount = 1;

            if (startDate) {
                countQuery += ` AND r.datenew >= $${countParamCount}`;
                countParams.push(startDate);
                countParamCount++;
            }
            if (endDate) {
                countQuery += ` AND r.datenew <= $${countParamCount}`;
                countParams.push(endDate);
                countParamCount++;
            }
            if (customerId) {
                countQuery += ` AND t.customer = $${countParamCount}`;
                countParams.push(customerId);
                countParamCount++;
            }
            if (userId) {
                countQuery += ` AND t.person = $${countParamCount}`;
                countParams.push(userId);
                countParamCount++;
            }
            if (ticketNumber) {
                countQuery += ` AND t.ticketid = $${countParamCount}`;
                countParams.push(ticketNumber);
                countParamCount++;
            }

            const countResult = await pool.query(countQuery, countParams);

            res.json({
                tickets: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].total),
                    totalPages: Math.ceil(countResult.rows[0].total / limit)
                }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener historial de ventas' });
        }
    },

    getTicketById: async (req, res) => {
        try {
            const { id } = req.params;

            const ticketQuery = `
                SELECT 
                    t.id,
                    t.ticketid as ticket_number,
                    t.tickettype,
                    r.datenew as date,
                    c.id as customer_id,
                    c.name as customer_name,
                    c.taxid as customer_taxid,
                    c.phone as customer_phone,
                    c.address as customer_address,
                    p.id as cashier_id,
                    p.name as cashier_name,
                t.status,
                r.money,
                r.currency_id,
                r.exchange_rate,
                (
                    SELECT COALESCE(SUM(p.amount_base_currency), 0)
                    FROM payments p
                    WHERE p.receipt = r.id
                ) / COALESCE(r.exchange_rate, 1) as total
            FROM tickets t
            INNER JOIN receipts r ON t.id = r.id
            LEFT JOIN customers c ON t.customer = c.id
            LEFT JOIN people p ON t.person = p.id
            WHERE t.id = $1
        `;
            const ticketResult = await pool.query(ticketQuery, [id]);

            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ticket no encontrado' });
            }

            const ticket = ticketResult.rows[0];

            const linesQuery = `
                SELECT 
                    tl.line,
                    tl.product,
                    pr.name as product_name,
                    pr.reference as product_reference,
                    tl.units,
                    tl.price,
                    tl.taxid,
                    t.rate as tax_rate,
                    (tl.units * tl.price) as subtotal,
                    (tl.units * tl.price * t.rate) as tax_amount,
                    (tl.units * tl.price * (1 + t.rate)) as total
                FROM ticketlines tl
                LEFT JOIN products pr ON tl.product = pr.id
                LEFT JOIN taxes t ON tl.taxid = t.id
                WHERE tl.ticket = $1
                ORDER BY tl.line
            `;
            const linesResult = await pool.query(linesQuery, [id]);

            const paymentsQuery = `
                SELECT 
                    p.payment,
                    p.total,
                    p.currency_id,
                    p.exchange_rate,
                    p.amount_base_currency,
                    COALESCE(b.name, p.bank) as bank,
                    p.bank_id as raw_bank_id,
                    p.numdocument as cedula,
                    p.transid as reference
                FROM payments p
                LEFT JOIN banks b ON p.bank_id = b.id
                WHERE p.receipt = $1
            `;
            const paymentsResult = await pool.query(paymentsQuery, [id]);

            const taxesQuery = `
                SELECT 
                    tl.taxid,
                    tl.percentage,
                    tl.base,
                    tl.amount,
                    t.name
                FROM taxlines tl
                JOIN taxes t ON tl.taxid = t.id
                WHERE tl.receipt = $1
            `;
            const taxesResult = await pool.query(taxesQuery, [id]);

            console.log('Taxes found for ticket:', id, taxesResult.rows);

            // Separar IGTF de otros impuestos
            const taxes = [];
            let igtf_amount = 0;
            let igtf_amount_alt = 0;

            taxesResult.rows.forEach(t => {
                // Identificar IGTF por nombre (flexible)
                if (t.name && t.name.toLowerCase().includes('igtf')) {
                    igtf_amount += parseFloat(t.amount);
                    console.log('IGTF found:', t.amount);
                } else {
                    taxes.push(t);
                }
            });

            // Calcular alternativo (si el ticket es en divisas, igtf_amount ya está en divisas)
            if (ticket.currency_id === 2) { // USD
                igtf_amount_alt = igtf_amount; // El valor base es la divisa
            } else {
                // Si el ticket es en Bs, igtf_amount es Bs.
                // igtf_amount_alt sería la conversión a divisa si se requiere
                let rate = parseFloat(ticket.exchange_rate) || 1;

                // Si la tasa guardada es 1 pero la moneda es 1 (Bs), algo está mal con la tasa histórica o es 1:1
                // Intentamos derivar la tasa real de los pagos si existen
                if (rate === 1 && paymentsResult.rows.length > 0) {
                    const usdPayment = paymentsResult.rows.find(p => p.currency_id === 2);
                    if (usdPayment && parseFloat(usdPayment.exchange_rate) > 1) {
                        rate = parseFloat(usdPayment.exchange_rate);
                    } else {
                        // Buscar tasa implicita en pagos en Bs que tengan tasa registrada
                        const bsPaymentWithRate = paymentsResult.rows.find(p => parseFloat(p.exchange_rate) > 1);
                        if (bsPaymentWithRate) {
                            rate = parseFloat(bsPaymentWithRate.exchange_rate);
                        }
                    }
                }

                igtf_amount_alt = igtf_amount / rate;
            }

            res.json({
                ...ticket,
                lines: linesResult.rows,
                payments: paymentsResult.rows,
                taxes: taxes,
                igtf_amount: igtf_amount,
                igtf_amount_alt: igtf_amount_alt
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener detalles del ticket' });
        }
    },

    processRefund: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const {
                person_id,
                refund_lines,
                refund_payment_method,
                cash_register_id,
                currency_id,
                exchange_rate,
                location_id
            } = req.body;

            const locId = location_id || 1;

            await client.query('BEGIN');

            const originalTicketRes = await client.query('SELECT * FROM tickets WHERE id = $1', [id]);
            if (originalTicketRes.rows.length === 0) throw new Error('Ticket original no encontrado');

            const originalLines = await client.query('SELECT product, units FROM ticketlines WHERE ticket = $1', [id]);

            for (const refundLine of refund_lines) {
                const originalLine = originalLines.rows.find(l => l.product === refundLine.product_id);
                if (!originalLine) throw new Error(`Producto ${refundLine.product_id} no encontrado en ticket original`);
                if (Math.abs(refundLine.units) > originalLine.units) throw new Error(`No se pueden devolver más unidades de las vendidas`);
            }

            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            const receiptRes = await client.query(
                `INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [refund_payment_method || 'CASH_REFUND', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            await client.query(
                `INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status)
                 VALUES ($1, 1, $2, $3, $4, $5, $6, 0)`,
                [receiptId, ticketNumber, person_id, originalTicketRes.rows[0].customer, cash_register_id || null, currency_id || 1]
            );

            const taxSummary = {};
            let totalRefund = 0;

            for (let i = 0; i < refund_lines.length; i++) {
                const line = refund_lines[i];
                const units = -Math.abs(line.units);
                const lineTotal = units * line.price;
                totalRefund += lineTotal * (1 + (line.tax_rate || 0));

                await client.query(
                    `INSERT INTO ticketlines (ticket, line, product, units, price, taxid, discountid)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [receiptId, i, line.product_id, units, line.price, line.taxid, '001']
                );

                if (!taxSummary[line.taxid]) taxSummary[line.taxid] = { base: 0, amount: 0, rate: line.tax_rate };
                const base = units * line.price;
                const amount = base * line.tax_rate;
                taxSummary[line.taxid].base += base;
                taxSummary[line.taxid].amount += amount;

                const productCheck = await client.query('SELECT p.servicio, p.iscom FROM products p WHERE p.id = $1', [line.product_id]);
                const isService = productCheck.rows.length > 0 && (productCheck.rows[0].servicio === '1' || productCheck.rows[0].servicio === true);

                if (!isService) {
                    await client.query(`INSERT INTO stockcurrent (location, product, units) VALUES ($1, $2, $3) ON CONFLICT (location, product, attributesetinstance_id) DO UPDATE SET units = stockcurrent.units + $3`, [locId, line.product_id, -units]);
                    await client.query(`INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept) VALUES (NOW(), 1, $1, $2, $3, $4, $5)`, [locId, line.product_id, -units, line.price, `Devolución Ticket #${ticketNumber}`]);
                }
            }

            for (const taxid in taxSummary) {
                const summary = taxSummary[taxid];
                await client.query(`INSERT INTO taxlines (receipt, taxid, percentage, base, amount, datenew) VALUES ($1, $2, $3, $4, $5, NOW())`, [receiptId, taxid, summary.rate, summary.base, summary.amount]);
            }

            await client.query(`INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew) VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [receiptId, refund_payment_method || 'CASH_REFUND', totalRefund, currency_id || 1, exchange_rate || 1.0, totalRefund]);

            await client.query('COMMIT');
            res.status(201).json({ success: true, refundTicketId: receiptId, refundTicketNumber: ticketNumber, totalRefund: Math.abs(totalRefund) });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al procesar devolución: ' + err.message });
        } finally {
            client.release();
        }
    },

    createDebtPayment: async (req, res) => {
        const client = await pool.connect();
        try {
            const {
                customer_id,
                person_id,
                payments,
                cash_register_id,
                currency_id,
                exchange_rate,
                money_id,
                igtf_amount,
                igtf_amount_alt
            } = req.body;

            if (!customer_id) return res.status(400).json({ error: 'Debe proporcionar un ID de cliente' });

            await client.query('BEGIN');

            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            const receiptRes = await client.query(`INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew, change) VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING id`, [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0, req.body.change || 0]);
            const receiptId = receiptRes.rows[0].id;

            await client.query(`INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status) VALUES ($1, 2, $2, $3, $4, $5, $6, 0)`, [receiptId, ticketNumber, person_id, customer_id, cash_register_id || null, currency_id || 1]);

            let totalPayedUSD = 0;

            for (const p of payments) {
                const currentCurrencyId = p.currency_id || currency_id || 1;
                const systemExchangeRate = parseFloat(p.exchange_rate || exchange_rate || 1.0);
                let currentExchangeRate = (currentCurrencyId === 2) ? 1.0 : systemExchangeRate;
                const realAmountUSD = (currentCurrencyId === 2) ? p.total : (p.total / systemExchangeRate);

                await client.query(`INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid, bank_id, account_number, is_pago_movil) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12)`, [receiptId, p.method, p.total, currentCurrencyId, currentExchangeRate, p.amount_base || (p.total * systemExchangeRate), p.bank || '', p.cedula || '', p.reference || '', p.bank_id || null, p.account || '', p.is_pago_movil || false]);

                if (p.bank_id) {
                    try {
                        const bankRes = await client.query('SELECT current_balance FROM banks WHERE id = $1', [p.bank_id]);
                        if (bankRes.rows.length > 0) {
                            const amountForBank = p.amount_base || (p.total * systemExchangeRate);
                            const finalNewBalance = parseFloat(bankRes.rows[0].current_balance) + parseFloat(amountForBank);
                            await client.query(`INSERT INTO bank_transactions (bank_id, transaction_type, amount, balance_after, reference_type, reference_id, payment_method, description) VALUES ($1, 'INCOME', $2, $3, 'DEBT_PAYMENT', $4, $5, $6)`, [p.bank_id, amountForBank, finalNewBalance, receiptId, p.method, `Abono Deuda #${ticketNumber}`]);
                            await client.query('UPDATE banks SET current_balance = $1 WHERE id = $2', [finalNewBalance, p.bank_id]);
                        }
                    } catch (e) {
                        console.error('Error actualizando banco:', e);
                    }
                }

                if (p.invoice_number) {
                    const originalTicketRes = await client.query('SELECT id FROM tickets WHERE ticketid = $1 AND tickettype = 0', [p.invoice_number]);
                    if (originalTicketRes.rows.length > 0) {
                        await client.query(`INSERT INTO payments_account (receipt, payment, total, currency_id, exchange_rate, datenew, concepto, bank, numdocument) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`, [originalTicketRes.rows[0].id, p.method, -p.total, currentCurrencyId, currentExchangeRate, `Abono Ticket #${ticketNumber}`, p.bank || '', p.cedula || '']);
                    }
                }
                totalPayedUSD += realAmountUSD;
            }

            if (igtf_amount > 0) {
                let igtfTaxId = null;
                const igtfTaxRes = await client.query("SELECT id FROM taxes WHERE name ILIKE '%igtf%' LIMIT 1");
                if (igtfTaxRes.rows.length > 0) {
                    igtfTaxId = igtfTaxRes.rows[0].id;
                } else {
                    const newIgtfTax = await client.query("INSERT INTO taxes (name, rate, validfrom, category) VALUES ('IGTF 3%', 0.03, NOW(), (SELECT id FROM taxcategories LIMIT 1)) RETURNING id");
                    igtfTaxId = newIgtfTax.rows[0].id;
                }
                await client.query(`INSERT INTO taxlines (receipt, taxid, percentage, base, amount, datenew) VALUES ($1, $2, $3, $4, $5, NOW())`, [receiptId, igtfTaxId, 0.03, (igtf_amount / 0.03), igtf_amount]);
            }

            await client.query('UPDATE customers SET curdebt = curdebt - $1, curdate = NOW() WHERE id = $2', [totalPayedUSD, customer_id]);
            await client.query('COMMIT');
            res.status(201).json({ message: 'Pago procesado', receiptId: receiptId, ticketNumber: ticketNumber });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error: ' + err.message });
        } finally {
            client.release();
        }
    }
};

async function processCompoundProductStock(client, productId, quantity, price, ticketNumber, locId) {
    const insumosRes = await client.query('SELECT idinsumo, cantidad FROM product_insumos WHERE idproduct = $1', [productId]);
    for (const insumo of insumosRes.rows) {
        const required = await calculateUnitFactor(client, insumo.idinsumo, productId, quantity);
        const stockRes = await client.query('SELECT SUM(units) FROM stockcurrent WHERE product = $1 AND location = $2', [insumo.idinsumo, locId]);
        if (parseFloat(stockRes.rows[0].sum || 0) < required) throw new Error(`Stock insuficiente del insumo ${insumo.idinsumo}`);
        await client.query(`INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept) VALUES (NOW(), -1, $1, $2, $3, (SELECT pricesell FROM products WHERE id = $2), $4)`, [locId, insumo.idinsumo, -required, `Venta Compuesto #${ticketNumber}`]);
        await client.query(`INSERT INTO stockcurrent (location, product, units) VALUES ($1, $2, $3) ON CONFLICT (location, product, attributesetinstance_id) DO UPDATE SET units = stockcurrent.units + $3`, [locId, insumo.idinsumo, -required]);
    }
    const pricesRes = await client.query('SELECT pricebuy, pricesell FROM products WHERE id = $1', [productId]);
    await client.query(`INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept) VALUES (NOW(), 1, $1, $2, $3, $4, $5)`, [locId, productId, quantity, pricesRes.rows[0].pricebuy, `Fabricación #${ticketNumber}`]);
    await client.query(`INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept) VALUES (NOW(), -1, $1, $2, $3, $4, $5)`, [locId, productId, -quantity, pricesRes.rows[0].pricesell, `Venta Ticket #${ticketNumber}`]);
}

async function calculateUnitFactor(client, insumoId, productId, productQuantity) {
    const insumoRes = await client.query('SELECT cantidad, unidadinsumo FROM product_insumos WHERE idinsumo = $1 AND idproduct = $2', [insumoId, productId]);
    if (insumoRes.rows.length === 0) return 0;
    const { cantidad, unidadinsumo } = insumoRes.rows[0];
    const baseUnitRes = await client.query('SELECT codeunit FROM products WHERE id = $1', [insumoId]);
    let factor = 1.0;
    if (unidadinsumo !== baseUnitRes.rows[0].codeunit) {
        const convRes = await client.query('SELECT factor FROM unidades_conversion WHERE codeunidad = $1 AND codeunidadbase = $2', [unidadinsumo, baseUnitRes.rows[0].codeunit]);
        if (convRes.rows.length > 0) factor = parseFloat(convRes.rows[0].factor);
    }
    return cantidad * productQuantity * factor;
}

async function processKitStock(client, kitId, kitQuantity, selectedComponents, ticketNumber, locId) {
    let components = (selectedComponents && selectedComponents.length > 0) ? selectedComponents : (await client.query('SELECT component_id, quantity FROM product_kits WHERE kit_id = $1', [kitId])).rows;
    for (const comp of components) {
        const qty = (comp.quantity || 1) * kitQuantity;
        const stockRes = await client.query('SELECT SUM(units) FROM stockcurrent WHERE product = $1 AND location = $2', [comp.component_id, locId]);
        if (parseFloat(stockRes.rows[0].sum || 0) < qty) throw new Error(`Stock insuficiente componente ${comp.component_id}`);
        await client.query(`INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept) VALUES (NOW(), -1, $1, $2, $3, (SELECT pricesell FROM products WHERE id = $2), $4)`, [locId, comp.component_id, -qty, `Salida Kit #${kitId} - Ticket #${ticketNumber}`]);
        await client.query(`INSERT INTO stockcurrent (location, product, units) VALUES ($1, $2, $3) ON CONFLICT (location, product, attributesetinstance_id) DO UPDATE SET units = stockcurrent.units + $3`, [locId, comp.component_id, -qty]);
    }
}

module.exports = salesController;
