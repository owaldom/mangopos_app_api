const pool = require('../config/database');

const salesController = {
    // Obtener catálogo (categorías y productos)
    getCatalog: async (req, res) => {
        try {
            // Obtener todas las categorías con imagen (filtrar por visibilidad en POS)
            const categoriesRes = await pool.query('SELECT id, name, parentid, image, visible_in_pos FROM categories WHERE visible_in_pos = true ORDER BY name');

            // Obtener productos marcados como 'marketable' (venta)
            const productsRes = await pool.query(`
                SELECT p.id, p.reference, p.code, p.name, p.pricebuy, p.pricesell, p.category, p.taxcat, 
                       p.isscale, p.iscom, p.typeproduct, p.servicio, p.marketable, t.rate as tax_rate, t.id as tax_id, p.image,
                       CASE WHEN pc.product IS NOT NULL THEN true ELSE false END as incatalog,
                       COALESCE(SUM(s.units), 0) as stock
                FROM products p
                LEFT JOIN products_cat pc ON p.id = pc.product
                LEFT JOIN taxes t ON p.taxcat = t.category
                LEFT JOIN stockcurrent s ON p.id = s.product AND s.location = 1
                WHERE p.marketable = true
                GROUP BY p.id, p.reference, p.code, p.name, p.pricebuy, p.pricesell, p.category, p.taxcat, 
                         p.isscale, p.iscom, p.typeproduct, p.servicio, p.marketable, t.rate, t.id, p.image, pc.product
                ORDER BY p.name
            `);

            // Convertir imágenes de categorías de Buffer a Base64
            const categories = categoriesRes.rows.map(cat => ({
                ...cat,
                image: cat.image ? cat.image.toString('base64') : null
            }));

            // Convertir imágenes de productos de Buffer a Base64
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

    // Obtener monedas y tasas de cambio
    getCurrencies: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, code, name, symbol, exchange_rate, is_base FROM currencies WHERE active = true ORDER BY is_base DESC');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener monedas' });
        }
    },

    // Crear una venta (Receipt, Ticket, Lines, Payments, Stock)
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
                money_id
            } = req.body;

            await client.query('BEGIN');

            // 1. Obtener y actualizar el número de ticket correlativo
            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            // 2. Insertar Receipt
            const receiptRes = await client.query(
                `INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            // 3. Insertar Ticket
            const ticketRes = await client.query(
                `INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status)
                 VALUES ($1, 0, $2, $3, $4, $5, $6, 0) RETURNING id`,
                [receiptId, ticketNumber, person_id, customer_id || null, cash_register_id || null, currency_id || 1]
            );

            // 4. Insertar Líneas e Impuestos por línea (taxlines se suele resumir al final, pero Openbravo lo hace por línea o por ticket)
            // Para simplificar seguiremos la lógica de ticketlines y guardaremos el resumen en taxlines
            const taxSummary = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                await client.query(
                    `INSERT INTO ticketlines (ticket, line, product, units, price, taxid, discountid)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [receiptId, i, line.product_id, line.units, line.price, line.taxid, line.discountid || '001']
                );

                // Acumular para taxlines
                if (!taxSummary[line.taxid]) {
                    taxSummary[line.taxid] = { base: 0, amount: 0, rate: line.tax_rate };
                }
                const base = line.units * line.price;
                const amount = base * line.tax_rate;
                taxSummary[line.taxid].base += base;
                taxSummary[line.taxid].amount += amount;

                // 5. Validar y Actualizar Stock
                if (line.product_id) {
                    // Obtener información del producto
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
                        // Verificar si es producto compuesto
                        if (typeProduct === 'CO') {
                            // Procesar producto compuesto
                            await processCompoundProductStock(client, line.product_id, line.units, line.price, ticketNumber);
                        } else if (typeProduct === 'KI') {
                            // Procesar Kit (Combo)
                            await processKitStock(client, line.product_id, line.units, line.selectedComponents, ticketNumber);
                        } else {
                            // Producto normal - procesar stock normalmente
                            // Obtener stock actual con bloqueo (FOR UPDATE) para evitar race conditions
                            const stockRes = await client.query(
                                'SELECT SUM(units) as total FROM stockcurrent WHERE location = 1 AND product = $1',
                                [line.product_id]
                            );
                            const currentStock = parseFloat(stockRes.rows[0]?.total || 0);

                            if (currentStock < line.units) {
                                throw new Error(`Stock insuficiente para el producto ${line.product_name || line.product_id}. Disponible: ${currentStock}, Requerido: ${line.units}`);
                            }

                            // Restar del stock actual
                            await client.query(
                                `INSERT INTO stockcurrent (location, product, units)
                                 VALUES (1, $1, $2)
                                 ON CONFLICT (location, product, attributesetinstance_id) 
                                 DO UPDATE SET units = stockcurrent.units + $2`,
                                [line.product_id, -line.units]
                            );

                            // Registrar en Diario de Stock (reason = -1 para Venta)
                            await client.query(
                                `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                                 VALUES (NOW(), -1, 1, $1, $2, $3, $4)`,
                                [line.product_id, -line.units, line.price, `Venta Ticket #${ticketNumber}`]
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

            // 7. Insertar Payments
            for (const p of payments) {
                const currentCurrencyId = p.currency_id || currency_id || 1;
                let currentExchangeRate = p.exchange_rate || exchange_rate || 1.0;
                let currentAmountBase = p.amount_base || p.total;

                // Si el pago es en USD, la tasa para convertirlo a USD es 1.0
                // Y nos aseguramos que amount_base_currency sea el equivalente en Bs.
                if (currentCurrencyId === 2) {
                    currentAmountBase = p.total * (exchange_rate || 1.0);
                    currentExchangeRate = 1.0;
                }

                await client.query(
                    `INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
                    [
                        receiptId,
                        p.method,
                        p.total,
                        currentCurrencyId,
                        currentExchangeRate,
                        currentAmountBase,
                        p.bank || null,
                        p.cedula || null,     // map cedula -> numdocument
                        p.reference || null   // map reference -> transid
                    ]
                );

                // Lógica de Crédito (Deuda)
                if (p.method === 'debt' || p.method === 'Credito') {
                    if (!customer_id) {
                        throw new Error('Debe seleccionar un cliente para realizar una venta a crédito.');
                    }

                    // 1. Obtener datos actuales del cliente para validación
                    const customerRes = await client.query(
                        'SELECT maxdebt, curdebt FROM customers WHERE id = $1 FOR UPDATE',
                        [customer_id]
                    );

                    if (customerRes.rows.length === 0) {
                        throw new Error('Cliente no encontrado.');
                    }

                    const { maxdebt, curdebt } = customerRes.rows[0];
                    // Lógica CxC en Dólares: Convertir el abono a USD para guardar en curdebt
                    // Si ya es USD (currentCurrencyId === 2), amountInUSD = p.total
                    const amountInUSD = currentCurrencyId === 2 ? p.total : (currentAmountBase / currentExchangeRate);
                    const newDebtUSD = parseFloat(curdebt || 0) + amountInUSD;

                    // 2. Validar límite de crédito (maxdebt en USD vs newDebt en USD)
                    if (maxdebt > 0 && newDebtUSD > (parseFloat(maxdebt) + 0.01)) {
                        throw new Error(`Límite de crédito excedido. Límite: $ ${maxdebt}, Deuda actual + nueva (en USD): $ ${newDebtUSD.toFixed(2)}`);
                    }

                    // 3. Actualizar cliente (curdebt ahora almacena USD)
                    await client.query(
                        'UPDATE customers SET curdebt = $1, curdate = NOW() WHERE id = $2',
                        [newDebtUSD, customer_id]
                    );

                    // 4. Insertar en payments_account
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

    // Obtener historial de ventas con filtros
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

            // Filtros
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

            query += `
                -- No group by needed since we removed aggregate functions in main select
            `;

            // Filtros por total (después del GROUP BY)
            // Se multiplica por exchange_rate para comparar en Bolívares
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

            // Paginación
            const offset = (page - 1) * limit;
            query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await pool.query(query, params);

            // Contar total de registros
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

    // Obtener detalles completos de un ticket
    getTicketById: async (req, res) => {
        try {
            const { id } = req.params;

            // Información del ticket
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

            // Líneas del ticket
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

            // Pagos
            const paymentsQuery = `
                SELECT 
                    payment,
                    total,
                    currency_id,
                    exchange_rate,
                    amount_base_currency,
                    bank,
                    numdocument as cedula,
                    transid as reference
                FROM payments
                WHERE receipt = $1
            `;
            const paymentsResult = await pool.query(paymentsQuery, [id]);

            // Resumen de impuestos
            const taxesQuery = `
                SELECT 
                    taxid,
                    percentage,
                    base,
                    amount
                FROM taxlines
                WHERE receipt = $1
            `;
            const taxesResult = await pool.query(taxesQuery, [id]);

            res.json({
                ...ticket,
                lines: linesResult.rows,
                payments: paymentsResult.rows,
                taxes: taxesResult.rows
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener detalles del ticket' });
        }
    },

    // Procesar devolución/reembolso
    processRefund: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params; // ID del ticket original
            const {
                person_id,
                refund_lines, // Array de { product_id, units, price, taxid, tax_rate }
                refund_payment_method,
                cash_register_id,
                currency_id,
                exchange_rate
            } = req.body;

            await client.query('BEGIN');

            // Verificar que el ticket original existe
            const originalTicket = await client.query(
                'SELECT * FROM tickets WHERE id = $1',
                [id]
            );

            if (originalTicket.rows.length === 0) {
                throw new Error('Ticket original no encontrado');
            }

            // Obtener líneas originales para validar
            const originalLines = await client.query(
                'SELECT product, units FROM ticketlines WHERE ticket = $1',
                [id]
            );

            // Validar que no se devuelvan más unidades de las vendidas
            for (const refundLine of refund_lines) {
                const originalLine = originalLines.rows.find(l => l.product === refundLine.product_id);
                if (!originalLine) {
                    throw new Error(`Producto ${refundLine.product_id} no encontrado en ticket original`);
                }
                if (Math.abs(refundLine.units) > originalLine.units) {
                    throw new Error(`No se pueden devolver más unidades de las vendidas para producto ${refundLine.product_id}`);
                }
            }

            // Obtener y actualizar número de ticket
            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            // Crear Receipt para la devolución
            const receiptRes = await client.query(
                `INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [refund_payment_method || 'CASH_REFUND', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            // Crear Ticket de devolución (tickettype = 1 para devoluciones)
            await client.query(
                `INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status)
                 VALUES ($1, 1, $2, $3, $4, $5, $6, 0)`,
                [receiptId, ticketNumber, person_id, originalTicket.rows[0].customer, cash_register_id || null, currency_id || 1]
            );

            // Insertar líneas de devolución (con cantidades negativas)
            const taxSummary = {};
            let totalRefund = 0;

            for (let i = 0; i < refund_lines.length; i++) {
                const line = refund_lines[i];
                const units = -Math.abs(line.units); // Asegurar que sea negativo

                await client.query(
                    `INSERT INTO ticketlines (ticket, line, product, units, price, taxid, discountid)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [receiptId, i, line.product_id, units, line.price, line.taxid, '001']
                );

                // Acumular impuestos
                if (!taxSummary[line.taxid]) {
                    taxSummary[line.taxid] = { base: 0, amount: 0, rate: line.tax_rate };
                }
                const base = units * line.price;
                const amount = base * line.tax_rate;
                taxSummary[line.taxid].base += base;
                taxSummary[line.taxid].amount += amount;

                // Devolver stock y Registrar en diario
                // Check if product is service
                const productCheck = await client.query(
                    'SELECT p.servicio, p.iscom FROM products p WHERE p.id = $1',
                    [line.product_id]
                );

                const isService = productCheck.rows.length > 0 && (
                    productCheck.rows[0].servicio === '1' ||
                    productCheck.rows[0].servicio === true ||
                    productCheck.rows[0].servicio === 'true'
                );

                if (!isService) {
                    // Devolver stock
                    await client.query(
                        `INSERT INTO stockcurrent (location, product, units)
                         VALUES (1, $1, $2)
                         ON CONFLICT (location, product, attributesetinstance_id) 
                         DO UPDATE SET units = stockcurrent.units + $2`,
                        [line.product_id, -units] // Sumar de vuelta (units es negativo)
                    );

                    // Registrar en diario de stock (reason = 1 para devolución)
                    await client.query(
                        `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                         VALUES (NOW(), 1, 1, $1, $2, $3, $4)`,
                        [line.product_id, -units, line.price, `Devolución Ticket #${ticketNumber} (Original: #${originalTicket.rows[0].ticketid})`]
                    );
                }
            }

            // Insertar taxlines
            for (const taxid in taxSummary) {
                const summary = taxSummary[taxid];
                await client.query(
                    `INSERT INTO taxlines (receipt, taxid, percentage, base, amount, datenew)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [receiptId, taxid, summary.rate, summary.base, summary.amount]
                );
            }

            // Insertar pago de devolución (negativo)
            await client.query(
                `INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [receiptId, refund_payment_method || 'CASH_REFUND', totalRefund, currency_id || 1, exchange_rate || 1.0, totalRefund]
            );

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                refundTicketId: receiptId,
                refundTicketNumber: ticketNumber,
                totalRefund: Math.abs(totalRefund)
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al procesar devolución: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Crear un abono/pago a deuda de cliente
    createDebtPayment: async (req, res) => {
        const client = await pool.connect();
        try {
            const {
                customer_id,
                person_id,
                payments, // Array of { method, total, bank, numdocument, invoice_number, currency_id, exchange_rate, amount_base }
                cash_register_id,
                currency_id,
                exchange_rate,
                money_id
            } = req.body;

            if (!customer_id) {
                return res.status(400).json({ error: 'Debe proporcionar un ID de cliente' });
            }

            await client.query('BEGIN');

            // 1. Obtener y actualizar el número de ticket correlativo
            const ticketNumRes = await client.query('UPDATE ticketsnum SET id = id + 1 RETURNING id');
            const ticketNumber = ticketNumRes.rows[0].id;

            // 2. Insertar Receipt
            const receiptRes = await client.query(
                `INSERT INTO receipts (money, cash_register_id, currency_id, exchange_rate, datenew) 
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
                [money_id || 'CASH_MONEY', cash_register_id || null, currency_id || 1, exchange_rate || 1.0]
            );
            const receiptId = receiptRes.rows[0].id;

            // 3. Insertar Ticket (Type 2 = RECEIPT_PAYMENT)
            await client.query(
                `INSERT INTO tickets (id, tickettype, ticketid, person, customer, cash_register_id, currency_id, status)
                 VALUES ($1, 2, $2, $3, $4, $5, $6, 0)`,
                [receiptId, ticketNumber, person_id, customer_id, cash_register_id || null, currency_id || 1]
            );

            let totalPayedUSD = 0;

            // 4. Procesar Pagos
            for (const p of payments) {
                const currentCurrencyId = p.currency_id || currency_id || 1;
                const systemExchangeRate = parseFloat(p.exchange_rate || exchange_rate || 1.0);

                let currentExchangeRate = systemExchangeRate;
                let currentAmountBase = parseFloat(p.amount_base || p.total);

                // Si el pago es en USD, la tasa para convertirlo a USD es 1.0
                if (currentCurrencyId === 2) {
                    currentExchangeRate = 1.0;
                    // p.total ya viene en USD
                }

                // Calcular monto en USD para rebajar deuda (siempre usando amount_base y systemExchangeRate para curdebt)
                const amountUSD = (p.amount_base || (p.total * systemExchangeRate)) / systemExchangeRate;
                // Simplificando: si p.total es USD, amountUSD = p.total. Si p.total es Bs, amountUSD = p.total / rate.
                const realAmountUSD = currentCurrencyId === 2 ? p.total : (p.total / systemExchangeRate);

                // Insertar en PAYMENTS
                await client.query(
                    `INSERT INTO payments (receipt, payment, total, currency_id, exchange_rate, amount_base_currency, datenew, bank, numdocument, transid)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
                    [
                        receiptId,
                        p.method,
                        p.total,
                        currentCurrencyId,
                        currentExchangeRate,
                        p.amount_base || (p.total * systemExchangeRate),
                        p.bank || '',
                        p.cedula || '',
                        p.reference || ''
                    ]
                );

                // Insertar en PAYMENTS_ACCOUNT (entrada negativa para la factura original)
                const originalTicketRes = await client.query(
                    'SELECT id FROM tickets WHERE ticketid = $1 AND tickettype = 0',
                    [p.invoice_number]
                );

                if (originalTicketRes.rows.length > 0) {
                    const originalReceiptId = originalTicketRes.rows[0].id;
                    await client.query(
                        `INSERT INTO payments_account (receipt, payment, total, currency_id, exchange_rate, datenew, concepto, bank, numdocument)
                         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
                        [
                            originalReceiptId,
                            p.method,
                            -p.total, // Negativo para reducir saldo
                            currentCurrencyId,
                            currentExchangeRate,
                            `Abono Ticket #${ticketNumber}`,
                            p.bank || '',
                            p.cedula || ''
                        ]
                    );
                }

                totalPayedUSD += realAmountUSD;
            }

            // 5. Actualizar Deuda del Cliente (Rebajar en USD)
            await client.query(
                'UPDATE customers SET curdebt = curdebt - $1, curdate = NOW() WHERE id = $2',
                [totalPayedUSD, customer_id]
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
                error: 'Error al procesar el pago de deuda',
                details: err.message
            });
        } finally {
            client.release();
        }
    }
};

// Helper function to process compound product stock
async function processCompoundProductStock(client, productId, quantity, price, ticketNumber) {
    try {
        // 1. Obtener todos los insumos del producto compuesto
        const insumosQuery = `
            SELECT idinsumo, cantidad, unidadinsumo
            FROM product_insumos
            WHERE idproduct = $1
        `;
        const insumosResult = await client.query(insumosQuery, [productId]);

        if (insumosResult.rows.length === 0) {
            throw new Error(`El producto compuesto ${productId} no tiene insumos configurados`);
        }

        // 2. Procesar cada insumo
        for (const insumo of insumosResult.rows) {
            // Calcular cantidad necesaria con conversión de unidades
            const requiredQuantity = await calculateUnitFactor(
                client,
                insumo.idinsumo,
                productId,
                quantity
            );

            // Validar stock del insumo
            const stockRes = await client.query(
                'SELECT COALESCE(SUM(units), 0) as stock FROM stockcurrent WHERE product = $1',
                [insumo.idinsumo]
            );
            const currentStock = parseFloat(stockRes.rows[0].stock);

            if (currentStock < requiredQuantity) {
                throw new Error(`Stock insuficiente del insumo para producto compuesto. Requerido: ${requiredQuantity}, Disponible: ${currentStock}`);
            }

            // Obtener precio del insumo
            const priceRes = await client.query(
                'SELECT pricesell FROM products WHERE id = $1',
                [insumo.idinsumo]
            );
            const insumoPrice = parseFloat(priceRes.rows[0]?.pricesell || 0);

            // Registrar salida del insumo (OUT_SALE)
            await client.query(
                `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                 VALUES (NOW(), -1, 1, $1, $2, $3, $4)`,
                [insumo.idinsumo, -requiredQuantity, insumoPrice, `Venta Producto Compuesto - Ticket #${ticketNumber}`]
            );

            // Actualizar stock del insumo
            await client.query(
                `INSERT INTO stockcurrent (location, product, units)
                 VALUES (1, $1, $2)
                 ON CONFLICT (location, product, attributesetinstance_id) 
                 DO UPDATE SET units = stockcurrent.units + $2`,
                [insumo.idinsumo, -requiredQuantity]
            );
        }

        // 3. Obtener precios del producto compuesto
        const productPricesRes = await client.query(
            'SELECT pricebuy, pricesell FROM products WHERE id = $1',
            [productId]
        );
        const priceBuy = parseFloat(productPricesRes.rows[0]?.pricebuy || 0);
        const priceSell = parseFloat(productPricesRes.rows[0]?.pricesell || price);

        // 4. Registrar entrada del producto compuesto (IN_PURCHASE - fabricación)
        await client.query(
            `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
             VALUES (NOW(), 1, 1, $1, $2, $3, $4)`,
            [productId, quantity, priceBuy, `Fabricación Producto Compuesto - Ticket #${ticketNumber}`]
        );

        // 5. Registrar salida del producto compuesto (OUT_SALE)
        await client.query(
            `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
             VALUES (NOW(), -1, 1, $1, $2, $3, $4)`,
            [productId, -quantity, priceSell, `Venta Ticket #${ticketNumber}`]
        );

        // Nota: No actualizamos stockcurrent del producto compuesto porque
        // entra y sale en la misma transacción (se fabrica y se vende)

    } catch (err) {
        console.error('Error en processCompoundProductStock:', err);
        throw err;
    }
}

// Helper function to calculate unit conversion factor
async function calculateUnitFactor(client, insumoId, productId, productQuantity) {
    try {
        // Obtener cantidad del insumo en la receta
        const insumoQuery = `
            SELECT cantidad, unidadinsumo
            FROM product_insumos
            WHERE idinsumo = $1 AND idproduct = $2
        `;
        const insumoResult = await client.query(insumoQuery, [insumoId, productId]);

        if (insumoResult.rows.length === 0) {
            return 0;
        }

        const cantidadInsumo = parseFloat(insumoResult.rows[0].cantidad);
        const unidadInsumo = insumoResult.rows[0].unidadinsumo;

        // Obtener unidad base del insumo
        const productQuery = `
            SELECT codeunit
            FROM products
            WHERE id = $1
        `;
        const productResult = await client.query(productQuery, [insumoId]);
        const unidadBase = productResult.rows[0].codeunit;

        // Obtener factor de conversión
        let factor = 1.0;
        if (unidadInsumo !== unidadBase) {
            const conversionQuery = `
                SELECT factor
                FROM unidades_conversion
                WHERE codeunidad = $1 AND codeunidadbase = $2
            `;
            const conversionResult = await client.query(conversionQuery, [unidadInsumo, unidadBase]);

            if (conversionResult.rows.length > 0) {
                factor = parseFloat(conversionResult.rows[0].factor);
            }
        }

        // Calcular cantidad final
        const finalQuantity = (cantidadInsumo * productQuantity) * factor;
        return finalQuantity;

    } catch (err) {
        console.error('Error en calculateUnitFactor:', err);
        throw err;
    }
}

// Helper function to process Kit (Combo) stock
async function processKitStock(client, kitId, kitQuantity, selectedComponents, ticketNumber) {
    try {
        let componentsToProcess = [];

        // 1. Determinar componentes a descontar
        if (selectedComponents && Array.isArray(selectedComponents) && selectedComponents.length > 0) {
            // Kit Flexible: Usar lo que envió el frontend (selección del cajero)
            componentsToProcess = selectedComponents.map(c => ({
                component_id: c.component_id,
                quantity: c.quantity || 1
            }));
        } else {
            // Kit Fijo o Por Defecto: Obtener de la base de datos
            const kitDefRes = await client.query(
                'SELECT component_id, quantity FROM product_kits WHERE kit_id = $1',
                [kitId]
            );
            componentsToProcess = kitDefRes.rows;
        }

        if (componentsToProcess.length === 0) {
            console.warn(`Kit ${kitId} no tiene componentes configurados o seleccionados.`);
            return;
        }

        // 2. Procesar cada componente
        for (const comp of componentsToProcess) {
            const finalQuantity = comp.quantity * kitQuantity;

            // Validar stock del componente
            const stockRes = await client.query(
                'SELECT COALESCE(SUM(units), 0) as stock FROM stockcurrent WHERE product = $1 AND location = 1',
                [comp.component_id]
            );
            const currentStock = parseFloat(stockRes.rows[0].stock);

            if (currentStock < finalQuantity) {
                // Obtenemos nombre para el error
                const nameRes = await client.query('SELECT name FROM products WHERE id = $1', [comp.component_id]);
                const compName = nameRes.rows[0]?.name || comp.component_id;
                throw new Error(`Stock insuficiente del componente "${compName}" para el kit. Requerido: ${finalQuantity}, Disponible: ${currentStock}`);
            }

            // Registrar salida del componente (OUT_SALE)
            await client.query(
                `INSERT INTO stockdiary (datenew, reason, location, product, units, price, concept)
                 VALUES (NOW(), -1, 1, $1, $2, (SELECT pricesell FROM products WHERE id = $1), $3)`,
                [comp.component_id, -finalQuantity, `Salida Kit #${kitId} - Ticket #${ticketNumber}`]
            );

            // Actualizar stock del componente
            await client.query(
                `INSERT INTO stockcurrent (location, product, units)
                 VALUES (1, $1, $2)
                 ON CONFLICT (location, product, attributesetinstance_id) 
                 DO UPDATE SET units = stockcurrent.units + $2`,
                [comp.component_id, -finalQuantity]
            );
        }
    } catch (err) {
        console.error('Error in processKitStock:', err);
        throw err;
    }
}

module.exports = salesController;
