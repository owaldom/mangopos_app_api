const pool = require('../config/database');

const reportsController = {
    // 1. VENTAS: Ventas por Usuario
    getSalesByUser: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    p.name as user_name, 
                    MIN(r.datenew) as first_sale, 
                    MAX(r.datenew) as last_sale, 
                    SUM(tl.units * tl.price) as total_base,
                    SUM(tl.units * tl.price * tx.rate) as total_tax,
                    SUM(tl.units * tl.price * (1 + tx.rate)) as total_with_tax
                FROM people p
                JOIN tickets t ON p.id = t.person
                JOIN receipts r ON t.id = r.id
                JOIN ticketlines tl ON t.id = tl.ticket
                JOIN taxes tx ON tl.taxid = tx.id
                WHERE r.datenew BETWEEN $1 AND $2
                GROUP BY p.name
                ORDER BY total_with_tax DESC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener ventas por usuario' });
        }
    },

    // 2. VENTAS: Ventas por Producto
    getSalesByProduct: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    p.reference, 
                    p.name as product_name, 
                    SUM(tl.units) as units_sold, 
                    SUM(tl.units * tl.price) as total_base,
                    SUM(tl.units * tl.price * tx.rate) as total_tax,
                    SUM(tl.units * tl.price * (1 + tx.rate)) as total_with_tax
                FROM products p
                JOIN ticketlines tl ON p.id = tl.product
                JOIN tickets t ON tl.ticket = t.id
                JOIN receipts r ON t.id = r.id
                JOIN taxes tx ON tl.taxid = tx.id
                WHERE r.datenew BETWEEN $1 AND $2
                GROUP BY p.id, p.reference, p.name
                ORDER BY units_sold DESC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener ventas por producto' });
        }
    },

    // 3. VENTAS: Impuestos
    getSalesByTax: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    tx.name as tax_name, 
                    tx.rate as tax_rate,
                    SUM(tl.units * tl.price) as base_amount,
                    SUM(tl.units * tl.price * tx.rate) as tax_amount
                FROM taxes tx
                JOIN ticketlines tl ON tx.id = tl.taxid
                JOIN tickets t ON tl.ticket = t.id
                JOIN receipts r ON t.id = r.id
                WHERE r.datenew BETWEEN $1 AND $2
                GROUP BY tx.id, tx.name, tx.rate
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener reporte de impuestos' });
        }
    },

    // 4. INVENTARIO: Existencias Actuales
    getInventoryCurrent: async (req, res) => {
        try {
            const query = `
                SELECT 
                    p.reference as REFERENCIA, 
                    p.code as CODIGO,
                    p.name as NOMBRE, 
                    c.name as CATEGORIA,
                    p.pricesell as PRECIO,
                    COALESCE(SUM(s.units), 0) as CANTIDAD
                FROM products p
                INNER JOIN categories c ON p.category = c.id
                LEFT JOIN stockcurrent s ON p.id = s.product AND s.location = '0'
                WHERE p.servicio = false
                GROUP BY p.id, p.reference, p.code, p.name, c.name, p.pricesell
                ORDER BY c.name, p.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getInventoryCurrent:', err);
            res.status(500).json({ error: 'Error al obtener existencias detalladas: ' + err.message });
        }
    },

    // 4.1 INVENTARIO: Inventario General
    getInventoryGeneral: async (req, res) => {
        try {
            const query = `
                SELECT 
                    l.name AS locationname, 
                    p.reference, 
                    p.name AS productname, 
                    p.codeunit AS unitmetric, 
                    c.name AS categoryname, 
                    SUM(s.units) AS units, 
                    p.averagecost, 
                    p.pricesell, 
                    COALESCE(p.stockvolume, 0) AS stockvolume, 
                    COALESCE(p.stockcost, 0) AS stockcost, 
                    COALESCE(sl.stocksecurity, 0) AS stocksecurity, 
                    COALESCE(sl.stockmaximum, 0) AS stockmaximum 
                FROM stockcurrent s
                JOIN locations l ON s.location = l.id 
                JOIN products p ON s.product = p.id 
                JOIN categories c ON p.category = c.id 
                LEFT JOIN stocklevel sl ON s.location = sl.location AND s.product = sl.product 
                WHERE p.servicio = FALSE AND p.typeproduct != 'CO' 
                GROUP BY l.id, l.name, p.id, p.reference, p.name, p.codeunit, c.id, c.name, p.averagecost, p.pricesell, p.stockvolume, p.stockcost, sl.stocksecurity, sl.stockmaximum 
                ORDER BY l.name, c.name, p.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getInventoryGeneral:', err);
            res.status(500).json({ error: 'Error al obtener inventario general: ' + err.message });
        }
    },

    // 4.2 INVENTARIO: Stock Bajo (Alertas)
    getInventoryLowStock: async (req, res) => {
        try {
            const query = `
                SELECT 
                    l.name AS locationname, 
                    p.reference, 
                    p.name, 
                    c.name AS categoryname, 
                    SUM(s.units) AS units, 
                    COALESCE(sl.stocksecurity, 0) AS stocksecurity, 
                    COALESCE(sl.stockmaximum, 0) AS stockmaximum 
                FROM stockcurrent s
                JOIN locations l ON s.location = l.id 
                JOIN products p ON s.product = p.id 
                JOIN categories c ON p.category = c.id  
                LEFT JOIN stocklevel sl ON s.location = sl.location AND s.product = sl.product 
                WHERE p.servicio = FALSE AND p.typeproduct != 'CO' 
                GROUP BY l.id, l.name, p.id, p.reference, p.name, p.category, c.name, sl.stocksecurity, sl.stockmaximum 
                HAVING sl.stocksecurity IS NOT NULL AND sl.stocksecurity >= SUM(s.units) 
                ORDER BY c.name, p.name, l.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getInventoryLowStock:', err);
            res.status(500).json({ error: 'Error al obtener reporte de stock bajo: ' + err.message });
        }
    },

    // 4.3 INVENTARIO: Movimientos/Diferencias
    getInventoryMovements: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    l.name AS locationname, 
                    p.reference, p.name, p.codeunit AS unitmetric, c.name AS categoryname, 
                    SUM(CASE WHEN sd.units < 0 THEN sd.units ELSE 0 END) AS unitsout, 
                    SUM(CASE WHEN sd.units < 0 THEN sd.units * sd.price ELSE 0 END) AS totalout, 
                    SUM(CASE WHEN sd.units >= 0 THEN sd.units ELSE 0 END) AS unitsin, 
                    SUM(CASE WHEN sd.units >= 0 THEN sd.units * sd.price ELSE 0 END) AS totalin, 
                    SUM(sd.units) AS unitsdiff, 
                    SUM(sd.units * sd.price) AS totaldiff 
                FROM stockdiary sd 
                JOIN locations l ON sd.location = l.id 
                JOIN products p ON sd.product = p.id
                LEFT JOIN categories c ON p.category = c.id 
                WHERE sd.datenew BETWEEN $1 AND $2 AND p.servicio = FALSE 
                GROUP BY l.id, l.name, p.id, p.reference, p.name, p.codeunit, c.id, c.name 
                ORDER BY l.name, c.name, p.name
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getInventoryMovements:', err);
            res.status(500).json({ error: 'Error al obtener movimientos de inventario: ' + err.message });
        }
    },

    // 4.4 INVENTARIO: Lista de Precios
    getInventoryPriceList: async (req, res) => {
        try {
            const query = `
                SELECT 
                    p.reference, p.code, p.name, p.pricesell, 
                    tc.name AS taxcatname, t.rate, 
                    c.name AS categoryname, 
                    dc.name AS discountcatname, COALESCE(disc.quantity, 0) as discount_qty, 
                    (p.pricesell * (1 - COALESCE(disc.quantity, 0))) AS pricesell_with_discount  
                FROM products p
                LEFT JOIN categories c ON p.category = c.id 
                LEFT JOIN taxcategories tc ON CAST(p.taxcat AS INTEGER) = tc.id 
                LEFT JOIN taxes t ON t.category = tc.id
                LEFT JOIN discountscategories dc ON CAST(p.discount AS INTEGER) = dc.id 
                LEFT JOIN discounts disc ON disc.idcategory = dc.id
                WHERE p.marketable = true
                ORDER BY p.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getInventoryPriceList:', err);
            res.status(500).json({ error: 'Error al obtener lista de precios: ' + err.message });
        }
    },

    // 4.5 INVENTARIO: Registro de Entradas
    getInventoryIntake: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    l.name AS locationname, 
                    p.reference, p.code, p.name, c.name AS categoryname, 
                    sd.datenew AS fecha, 
                    sd.units AS unitsin 
                FROM stockdiary sd 
                JOIN locations l ON sd.location = l.id
                JOIN products p ON sd.product = p.id 
                LEFT JOIN categories c ON p.category = c.id 
                WHERE p.id = sd.product AND sd.units >= -1 
                AND sd.datenew BETWEEN $1 AND $2
                ORDER BY l.id, sd.datenew DESC, c.name, p.name
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener registro de entradas' });
        }
    },

    // 5. COMPRAS: Compras por Proveedor
    getPurchasesBySupplier: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    tp.name as supplier_name, 
                    COUNT(t.id) as invoice_count,
                    SUM((SELECT COALESCE(SUM(pay.amount_base_currency), 0) FROM paymentspurchase pay WHERE pay.receipt = r.id)) as total_purchased
                FROM thirdparties tp
                JOIN ticketspurchase t ON tp.id = t.supplier
                JOIN receiptspurchase r ON t.id = r.id
                WHERE r.datenew BETWEEN $1 AND $2
                GROUP BY tp.id, tp.name
                ORDER BY total_purchased DESC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener compras por proveedor' });
        }
    },

    // 6. VENTAS: Libro de Ventas
    getSalesBook: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            // Note: In Java it uses vw_BookSales. We assume it exists or use equivalent query.
            const query = `
                SELECT 
                    DATEINVOICE, RIF, RAZONSOCIAL, NUMEROFACTURA, NUMEROCONTROL, 
                    TOTALVENTASCONIVA, TOTALVENTASNOGRAVADAS, BASEIMPONIBLE, ALICUOTA, IMPUESTOIVA
                FROM vw_BookSales 
                WHERE DATEINVOICE BETWEEN $1 AND $2
                ORDER BY DATEINVOICE ASC, NUMEROFACTURA ASC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener libro de ventas (Verificar vw_BookSales)' });
        }
    },

    // 7. VENTAS: Utilidad
    getSalesUtility: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    p.reference, 
                    p.name as product_name, 
                    c.name as category_name,
                    SUM(-sd.units) as units_out,
                    SUM((-sd.units) * (sd.price - p.averagecost)) as utility
                FROM products p
                JOIN stockdiary sd ON p.id = sd.product
                JOIN categories c ON p.category = c.id
                WHERE sd.datenew BETWEEN $1 AND $2
                AND sd.units < 0 
                AND sd.reason = -1
                GROUP BY p.id, p.reference, p.name, c.name
                ORDER BY utility DESC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener reporte de utilidad' });
        }
    },

    // 8. VENTAS: Descuentos en Ventas
    getSalesDiscounts: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    t.ticketid, 
                    pe.name as user_name,
                    p.name as product_name,
                    tl.price,
                    tl.units,
                    (tl.price * tl.units) as subtotal
                FROM tickets t
                JOIN ticketlines tl ON t.id = tl.ticket
                JOIN products p ON p.id = tl.product
                JOIN receipts r ON r.id = t.id
                JOIN people pe ON pe.id = t.person
                WHERE r.datenew BETWEEN $1 AND $2
                AND t.id IN (
                    SELECT ticket FROM ticketlines WHERE price < 0
                )
                ORDER BY t.ticketid
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener reporte de descuentos' });
        }
    },

    // 8.1 VENTAS: Gráfico de Ventas
    getSalesChartData: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            // Group by day
            const query = `
                SELECT 
                    TO_CHAR(r.datenew, 'YYYY-MM-DD') as date,
                    SUM(tl.units * tl.price * (1 + tx.rate)) as total
                FROM tickets t
                JOIN receipts r ON t.id = r.id
                JOIN ticketlines tl ON t.id = tl.ticket
                JOIN taxes tx ON tl.taxid = tx.id
                WHERE r.datenew BETWEEN $1 AND $2
                AND t.tickettype = 0
                GROUP BY TO_CHAR(r.datenew, 'YYYY-MM-DD')
                ORDER BY date
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener datos para gráfico de ventas' });
        }
    },

    // ============ TIER 1: CRITICAL BUSINESS REPORTS ============

    // 9. COMPRAS: Libro de Compras (Purchase Book)
    getPurchasesBook: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            // Uses vw_BookPurchases view (similar to Sales Book)
            const query = `
                SELECT 
                    DATEINVOICE, DATEINVOICEF, RIF, RAZONSOCIAL, TIPOPROVEEDOR, 
                    NROCOMPRETIVA, NRONOTACREDITO, NROFACTURAAFECTADA, NUMEROFACTURA, 
                    NUMEROCONTROL, TIPOTRANSACCION, TOTALCOMPRASCONIVA, COMPRASEXENTAS, 
                    BASEIMPONIBLE, ALICUOTA, IMPUESTOIVA, IVARETENIDO
                FROM vw_BookPurchases 
                WHERE DATEINVOICE BETWEEN $1 AND $2
                ORDER BY DATEINVOICE ASC, NUMEROFACTURA ASC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getPurchasesBook:', err);
            res.status(500).json({ error: 'Error al obtener libro de compras (Verificar vw_BookPurchases): ' + err.message });
        }
    },

    // 10. COMPRAS: Cuentas por Pagar (CXP)
    getPurchasesCXP: async (req, res) => {
        try {
            const query = `
                SELECT 
                    cif, name, address, contactcomm, contactfact, payrule, 
                    faxnumber, phonecomm, phonefact, email, notes, 
                    creditdays, creditlimit, persontype, typesupplier, 
                    balance, curdate 
                FROM thirdparties 
                WHERE visible = true AND balance IS NOT NULL AND balance > 0
                ORDER BY balance DESC, name ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getPurchasesCXP:', err);
            res.status(500).json({ error: 'Error al obtener cuentas por pagar: ' + err.message });
        }
    },

    // 11. CAJA: Cierre de Caja (POS Closing Summary)
    getClosedPOS: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    cc.host, cc.hostsequence, cc.money, 
                    cc.datestart, cc.dateend, 
                    p.payment, SUM(p.total) AS total 
                FROM closedcash cc
                JOIN receipts r ON cc.money = r.money 
                JOIN payments p ON p.receipt = r.id 
                WHERE p.payment NOT IN ('debt', 'debtpaid', 'free') 
                  AND cc.dateend BETWEEN $1 AND $2
                GROUP BY cc.host, cc.hostsequence, cc.money, cc.datestart, cc.dateend, p.payment 
                ORDER BY cc.host, cc.datestart, cc.hostsequence
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getClosedPOS:', err);
            res.status(500).json({ error: 'Error al obtener cierre de caja: ' + err.message });
        }
    },

    // 12. CAJA: Detalle Cierre de Caja (POS Closing Detail)
    getClosedPOSDetail: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const query = `
                SELECT 
                    r.datenew, t.ticketid, 
                    CASE 
                        WHEN p.payment = 'cash' THEN 'Efectivo' 
                        WHEN p.payment = 'cheque' THEN 'Cheque' 
                        WHEN p.payment = 'paperin' THEN 'Cestaticket' 
                        WHEN p.payment = 'PagoMovil' THEN 'Pago Móvil'
                        WHEN p.payment = 'transfer' THEN 'Transferencia'
                        WHEN (p.payment = 'magcard' OR p.payment = 'Credito') THEN 'Tarjeta Credito' 
                        WHEN p.payment = 'Debito' THEN 'Tarjeta Debito'   
                        WHEN p.payment = 'cashin' THEN 'Entrada Efectivo' 
                        WHEN p.payment = 'cashout' THEN 'Salida Efectivo' 
                        WHEN p.payment = 'cashrefund' THEN 'Devoluciones' 
                        ELSE p.payment
                    END AS payment_type, 
                    p.total, 
                    CASE 
                        WHEN (p.concepto = ' ' OR p.concepto = 'null' OR p.concepto IS NULL) AND t.tickettype = 0 THEN 'Factura' 
                        WHEN (p.concepto = ' ' OR p.concepto = 'null' OR p.concepto IS NULL) AND t.tickettype = 2 THEN 'Abono de Credito' 
                        WHEN (p.concepto = 'apartado') AND t.tickettype = 0 THEN 'Inicial de Apartado' 
                        WHEN (p.concepto = 'abono' OR p.concepto = 'finiquito') AND t.tickettype = 3 THEN 'Abono de Apartado' 
                        WHEN (p.concepto = ' ' OR p.concepto = 'null' OR p.concepto IS NULL) AND t.tickettype = 1 THEN 'Devolucion' 
                        ELSE p.concepto 
                    END AS concepto 
                FROM receipts r
                LEFT JOIN tickets t ON r.id = t.id  
                INNER JOIN payments p ON r.id = p.receipt 
                WHERE p.payment NOT IN ('free', 'debt', 'debtpaid')
                  AND r.datenew BETWEEN $1 AND $2
                ORDER BY p.payment, r.datenew DESC
            `;
            const result = await pool.query(query, [startDate, endDate]);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getClosedPOSDetail:', err);
            res.status(500).json({ error: 'Error al obtener detalle de cierre: ' + err.message });
        }
    },

    // 13. CLIENTES: Lista de Clientes
    getCustomersList: async (req, res) => {
        try {
            const query = `
                SELECT 
                    id, taxid, name, address, notes, card, 
                    maxdebt, curdebt, email, phone, phone2, curdate 
                FROM customers 
                WHERE visible = true
                ORDER BY name ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getCustomersList:', err);
            res.status(500).json({ error: 'Error al obtener lista de clientes: ' + err.message });
        }
    },

    // 14. CLIENTES: Estado de Cuenta
    getCustomerStatement: async (req, res) => {
        try {
            const { startDate, endDate, customerId } = req.query;
            let query = `
                SELECT 
                    r.datenew, t.ticketid, c.taxid, c.name, 
                    (SELECT SUM(p.total) FROM payments p WHERE t.id = p.receipt) AS totalf, 
                    (SELECT CASE WHEN (ABS(SUM(pa.total)) IS NULL) THEN 0.0 ELSE ABS(SUM(pa.total)) END 
                     FROM payments_account pa WHERE t.id = pa.receipt AND pa.total < 0) AS totalp, 
                    ((SELECT SUM(p.total) FROM payments p WHERE t.id = p.receipt) - 
                     (SELECT CASE WHEN (ABS(SUM(pa.total)) IS NULL) THEN 0.0 ELSE ABS(SUM(pa.total)) END 
                      FROM payments_account pa WHERE t.id = pa.receipt AND pa.total < 0)) AS pendiente 
                FROM receipts r
                JOIN tickets t ON r.id = t.id
                JOIN customers c ON t.customer = c.id
                WHERE t.tickettype = 0
                  AND r.datenew BETWEEN $1 AND $2
            `;

            const params = [startDate, endDate];
            if (customerId) {
                query += ` AND c.id = $3`;
                params.push(customerId);
            }

            query += ` ORDER BY r.datenew DESC`;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getCustomerStatement:', err);
            res.status(500).json({ error: 'Error al obtener estado de cuenta: ' + err.message });
        }
    },

    // ============ TIER 2: FINANCIAL & ACCOUNTING REPORTS ============

    // 15. CLIENTES: Saldo de Clientes (Customer Balance)
    getCustomersBalance: async (req, res) => {
        try {
            const query = `
                SELECT 
                    id, taxid, name, address, notes, card, 
                    maxdebt, curdebt, email, phone, phone2, curdate 
                FROM customers 
                WHERE visible = true AND curdebt IS NOT NULL AND curdebt > 0
                ORDER BY curdebt DESC, name ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getCustomersBalance:', err);
            res.status(500).json({ error: 'Error al obtener saldo de clientes: ' + err.message });
        }
    },

    // 16. CLIENTES: Abonos de Clientes (Customer Payments/Credits)
    getCustomersPayments: async (req, res) => {
        try {
            const { startDate, endDate, customerId } = req.query;
            let query = `
                SELECT 
                    r.datenew, t.ticketid, 
                    CASE p.payment WHEN 'debtpaid' THEN 'Abono' END AS payment_type,
                    (p.total * -1) AS total, c.taxid, c.name 
                FROM receipts r
                JOIN tickets t ON r.id = t.id
                JOIN customers c ON t.customer = c.id
                JOIN payments p ON r.id = p.receipt
                WHERE p.payment = 'debtpaid'
                  AND r.datenew BETWEEN $1 AND $2
            `;

            const params = [startDate, endDate];
            if (customerId) {
                query += ` AND c.id = $3`;
                params.push(customerId);
            }

            query += ` ORDER BY c.name, r.datenew DESC`;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getCustomersPayments:', err);
            res.status(500).json({ error: 'Error al obtener abonos de clientes: ' + err.message });
        }
    },

    // 17. CLIENTES: Diario de Clientes (Customer Diary/Transactions)
    getCustomersDiary: async (req, res) => {
        try {
            const { startDate, endDate, customerId } = req.query;
            let query = `
                SELECT 
                    r.datenew, t.ticketid, 
                    CASE 
                        WHEN p.payment = 'cash' THEN 'Efectivo' 
                        WHEN p.payment = 'cheque' THEN 'Cheque' 
                        WHEN (p.payment = 'debt' OR p.payment = 'debtpaid') THEN 'Crédito' 
                        WHEN p.payment = 'PagoMovil' THEN 'Pago Móvil'
                        WHEN p.payment = 'transfer' THEN 'Transferencia'
                        WHEN p.payment = 'card' THEN 'Tarjeta'
                        WHEN p.payment = 'paperin' THEN 'Cestaticket' 
                        WHEN (p.payment = 'magcard' OR p.payment = 'Credito') THEN 'Tarjeta Crédito' 
                        WHEN p.payment = 'Debito' THEN 'Tarjeta Débito'   
                        WHEN p.payment = 'cashin' THEN 'Entrada Efectivo' 
                        WHEN p.payment = 'cashout' THEN 'Salida Efectivo' 
                        ELSE p.payment
                    END AS payment_type, 
                    p.total, c.taxid, c.name 
                FROM receipts r
                JOIN tickets t ON r.id = t.id
                JOIN customers c ON t.customer = c.id
                JOIN payments p ON r.id = p.receipt
                WHERE p.payment <> 'debtpaid'
                  AND r.datenew BETWEEN $1 AND $2
            `;

            const params = [startDate, endDate];
            if (customerId) {
                query += ` AND c.id = $3`;
                params.push(customerId);
            }

            query += ` ORDER BY c.name, r.datenew DESC`;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getCustomersDiary:', err);
            res.status(500).json({ error: 'Error al obtener diario de clientes: ' + err.message });
        }
    },

    // ============ TIER 4: PRODUCT CATALOGS ============

    // 18. PRODUCTOS: Lista de Productos
    getProductsList: async (req, res) => {
        try {
            const query = `
                SELECT 
                    p.id, p.reference, p.code, p.name, p.averagecost, p.pricesell, 
                    tc.id AS taxcat, tc.name AS taxcatname, 
                    c.id AS category, c.name AS categoryname, 
                    dc.id AS discountcat, dc.name AS discountcatname, 
                    COALESCE(d.quantity, 0) AS discount_quantity, 
                    (p.pricesell * (1 - COALESCE(d.quantity, 0))) AS pv 
                FROM products p
                LEFT JOIN categories c ON p.category = c.id
                LEFT JOIN taxcategories tc ON CAST(p.taxcat AS INTEGER) = tc.id
                LEFT JOIN discountscategories dc ON CAST(p.discount AS INTEGER) = dc.id
                LEFT JOIN discounts d ON d.idcategory = dc.id
                WHERE p.servicio = FALSE
                ORDER BY c.name, p.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getProductsList:', err);
            res.status(500).json({ error: 'Error al obtener lista de productos: ' + err.message });
        }
    },

    // 19. PRODUCTOS: Catálogo de Productos
    getProductsCatalog: async (req, res) => {
        try {
            const query = `
                SELECT 
                    p.reference, p.code, p.name, p.pricesell, 
                    c.name AS categoryname,
                    tc.name AS taxcatname
                FROM products p
                LEFT JOIN categories c ON p.category = c.id
                LEFT JOIN taxcategories tc ON CAST(p.taxcat AS INTEGER) = tc.id
                WHERE p.marketable = true
                ORDER BY c.name, p.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getProductsCatalog:', err);
            res.status(500).json({ error: 'Error al obtener catálogo de productos: ' + err.message });
        }
    },

    // 20. OTROS: Personal/Empleados
    getPeopleList: async (req, res) => {
        try {
            const query = `
                SELECT id, name, card, role, visible
                FROM people
                WHERE visible = true
                ORDER BY name ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getPeopleList:', err);
            res.status(500).json({ error: 'Error al obtener lista de personal: ' + err.message });
        }
    },

    // 21. VENTAS: Facturas con Divisas (IGTF Report)
    getInvoicesWithForeignCurrency: async (req, res) => {
        try {
            const { startDate, endDate, customerId } = req.query;

            let query = `
                SELECT 
                    t.ticketid as ticket_number,
                    r.datenew as date,
                    COALESCE(c.name, 'Cliente General') as customer_name,
                    c.taxid as customer_taxid,
                    r.currency_id,
                    r.exchange_rate,
                    SUM(tl.units * tl.price * (1 + COALESCE(tx.rate, 0))) as total_usd,
                    SUM(tl.units * tl.price * (1 + COALESCE(tx.rate, 0))) * r.exchange_rate as total_bs,
                    COALESCE(igtf_tax.amount, 0) as igtf_bs,
                    COALESCE(igtf_tax.amount / NULLIF(r.exchange_rate, 0), 0) as igtf_usd,
                    array_agg(DISTINCT p.payment) as payment_methods,
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM payments_account pa 
                            WHERE pa.receipt = r.id AND pa.total > 0
                        ) THEN 'partial'
                        ELSE 'paid'
                    END as status
                FROM tickets t
                JOIN receipts r ON t.id = r.id
                LEFT JOIN customers c ON t.customer = c.id
                JOIN ticketlines tl ON t.id = tl.ticket
                LEFT JOIN taxes tx ON tl.taxid = tx.id
                LEFT JOIN payments p ON r.id = p.receipt
                LEFT JOIN LATERAL (
                    SELECT tl2.amount 
                    FROM taxlines tl2
                    JOIN taxes tx2 ON tl2.taxid = tx2.id
                    WHERE tl2.receipt = r.id AND tx2.name ILIKE '%igtf%'
                    LIMIT 1
                ) igtf_tax ON true
                WHERE (r.currency_id = 2 OR igtf_tax.amount > 0)
                  AND t.tickettype = 0
                  AND r.datenew BETWEEN $1 AND $2
            `;

            const params = [startDate, endDate];
            let paramIdx = 3;

            if (customerId) {
                query += ` AND c.id = $${paramIdx}`;
                params.push(customerId);
                paramIdx++;
            }

            query += `
                GROUP BY t.ticketid, r.datenew, c.name, c.taxid, r.currency_id, r.exchange_rate, r.id, igtf_tax.amount
                ORDER BY r.datenew DESC, t.ticketid DESC
            `;

            const result = await pool.query(query, params);

            // Calculate summary
            const summary = {
                total_invoices: result.rows.length,
                total_igtf_usd: result.rows.reduce((sum, row) => sum + parseFloat(row.igtf_usd || 0), 0),
                total_igtf_bs: result.rows.reduce((sum, row) => sum + parseFloat(row.igtf_bs || 0), 0),
                total_sales_usd: result.rows.reduce((sum, row) => sum + parseFloat(row.total_usd || 0), 0),
                total_sales_bs: result.rows.reduce((sum, row) => sum + parseFloat(row.total_bs || 0), 0)
            };

            res.json({
                invoices: result.rows,
                summary
            });
        } catch (err) {
            console.error('Error in getInvoicesWithForeignCurrency:', err);
            res.status(500).json({ error: 'Error al obtener reporte de facturas con divisas: ' + err.message });
        }
    }
};

module.exports = reportsController;
