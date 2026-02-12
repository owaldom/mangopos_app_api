const pool = require('../config/database');
const crypto = require('crypto');

const formatDate = (dateInput) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    const pad = n => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const generateOrderNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DIST-${year}${month}${day}-${random}`;
};

const generateChecksum = (data) => {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

const distributionOrdersController = {
    // Get all distribution orders with pagination
    getAllOrders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;
            const status = req.query.status;
            const search = req.query.search;

            let whereConditions = [];
            let params = [];
            let paramIndex = 1;

            if (status) {
                whereConditions.push(`status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }

            if (search) {
                whereConditions.push(`(order_number ILIKE $${paramIndex} OR destination_location_name ILIKE $${paramIndex})`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

            // Count query
            const countQuery = `SELECT COUNT(*) FROM distribution_orders ${whereClause}`;
            const countResult = await pool.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count);

            // Data query
            const query = `
                SELECT * FROM distribution_orders
                ${whereClause}
                ORDER BY date_created DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(limit, offset);

            const result = await pool.query(query, params);

            res.json({
                data: result.rows,
                total: total,
                page: page,
                limit: limit,
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener órdenes de distribución' });
        }
    },

    // Get single distribution order by ID
    getOrderById: async (req, res) => {
        try {
            const { id } = req.params;

            const orderQuery = 'SELECT * FROM distribution_orders WHERE id = $1';
            const orderResult = await pool.query(orderQuery, [id]);

            if (orderResult.rows.length === 0) {
                return res.status(404).json({ error: 'Orden de distribución no encontrada' });
            }

            const linesQuery = 'SELECT * FROM distribution_order_lines WHERE distribution_order_id = $1';
            const linesResult = await pool.query(linesQuery, [id]);

            const order = orderResult.rows[0];
            order.lines = linesResult.rows;

            res.json(order);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener orden de distribución' });
        }
    },

    // Create new distribution order
    createOrder: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                origin_location_id,
                destination_location_name,
                lines,
                notes,
                created_by
            } = req.body;

            // Validate required fields
            if (!origin_location_id || !destination_location_name || !lines || lines.length === 0) {
                throw new Error('Faltan campos requeridos');
            }

            // Get origin location name
            const locationResult = await client.query('SELECT name FROM locations WHERE id = $1', [origin_location_id]);
            if (locationResult.rows.length === 0) {
                throw new Error('Ubicación de origen no encontrada');
            }
            const origin_location_name = locationResult.rows[0].name;

            // Validate stock availability for each product
            for (const line of lines) {
                const stockQuery = `
                    SELECT COALESCE(SUM(units), 0) as available_stock
                    FROM stockcurrent
                    WHERE product = $1 AND location = $2
                `;
                const stockResult = await client.query(stockQuery, [line.product_id, origin_location_id]);
                const availableStock = parseFloat(stockResult.rows[0].available_stock);

                if (availableStock < line.quantity_sent) {
                    const productResult = await client.query('SELECT name FROM products WHERE id = $1', [line.product_id]);
                    const productName = productResult.rows[0]?.name || 'Desconocido';
                    throw new Error(`Stock insuficiente para ${productName}. Disponible: ${availableStock}, Solicitado: ${line.quantity_sent}`);
                }
            }

            // Generate order number
            const order_number = generateOrderNumber();

            // Insert distribution order
            const orderQuery = `
                INSERT INTO distribution_orders (
                    order_number, origin_location_id, origin_location_name, 
                    destination_location_name, notes, created_by, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                RETURNING *
            `;
            const orderValues = [order_number, origin_location_id, origin_location_name, destination_location_name, notes, created_by];
            const orderResult = await client.query(orderQuery, orderValues);
            const newOrder = orderResult.rows[0];

            // Insert distribution lines
            const insertedLines = [];
            for (const line of lines) {
                // Get product details
                const productResult = await client.query(
                    'SELECT name, code, reference FROM products WHERE id = $1',
                    [line.product_id]
                );
                const product = productResult.rows[0];

                const lineQuery = `
                    INSERT INTO distribution_order_lines (
                        distribution_order_id, product_id, product_name, product_code,
                        quantity_sent, unit_cost
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `;
                const lineValues = [
                    newOrder.id,
                    line.product_id,
                    product.name,
                    product.code || product.reference,
                    line.quantity_sent,
                    line.unit_cost || 0
                ];
                const lineResult = await client.query(lineQuery, lineValues);
                insertedLines.push(lineResult.rows[0]);
            }

            // Create stock movements (DISTRIBUTION_OUT)
            for (const line of lines) {
                const stockDiaryQuery = `
                    INSERT INTO stockdiary (
                        datenew, reason, location, product, attributesetinstance_id, units, price, concept
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;
                const stockDiaryValues = [
                    formatDate(),
                    -1, // DISTRIBUTION_OUT reason (we'll define this as -1)
                    origin_location_id,
                    line.product_id,
                    null,
                    -Math.abs(line.quantity_sent), // Negative for outgoing
                    line.unit_cost || 0,
                    `Distribución ${order_number} hacia ${destination_location_name}`
                ];
                await client.query(stockDiaryQuery, stockDiaryValues);

                // Update stockcurrent
                await client.query(`
                    UPDATE stockcurrent 
                    SET units = units - $1
                    WHERE location = $2 AND product = $3 AND attributesetinstance_id IS NULL
                `, [line.quantity_sent, origin_location_id, line.product_id]);
            }

            await client.query('COMMIT');

            newOrder.lines = insertedLines;
            res.status(201).json(newOrder);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al crear orden de distribución: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Export distribution order to JSON
    exportOrder: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;

            // Get order
            const orderResult = await client.query('SELECT * FROM distribution_orders WHERE id = $1', [id]);
            if (orderResult.rows.length === 0) {
                return res.status(404).json({ error: 'Orden no encontrada' });
            }

            // Get lines
            const linesResult = await client.query('SELECT * FROM distribution_order_lines WHERE distribution_order_id = $1', [id]);

            const order = orderResult.rows[0];
            const lines = linesResult.rows.map(line => ({
                product_code: line.product_code,
                product_name: line.product_name,
                quantity: parseFloat(line.quantity_sent),
                unit_cost: parseFloat(line.unit_cost)
            }));

            const exportData = {
                version: '1.0',
                distribution_order: {
                    order_number: order.order_number,
                    dispatch_document_number: order.dispatch_document_number || '',
                    origin: order.origin_location_name,
                    destination: order.destination_location_name,
                    date_created: order.date_created,
                    lines: lines,
                    total_items: lines.reduce((sum, line) => sum + line.quantity, 0),
                    notes: order.notes || ''
                }
            };

            // Generate checksum
            const checksum = generateChecksum(exportData.distribution_order);
            exportData.distribution_order.checksum = checksum;

            // Update order status and checksum
            await client.query(
                'UPDATE distribution_orders SET status = $1, checksum = $2 WHERE id = $3',
                ['exported', checksum, id]
            );

            res.json(exportData);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al exportar orden: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Import and receive distribution order
    importOrder: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                distribution_data,
                dispatch_document_number,
                location_id,
                received_by,
                reception_notes
            } = req.body;

            if (!distribution_data || !location_id) {
                throw new Error('Datos de distribución y ubicación son requeridos');
            }

            const orderData = distribution_data.distribution_order;

            // Validate checksum
            const calculatedChecksum = generateChecksum({
                order_number: orderData.order_number,
                dispatch_document_number: orderData.dispatch_document_number,
                origin: orderData.origin,
                destination: orderData.destination,
                date_created: orderData.date_created,
                lines: orderData.lines,
                total_items: orderData.total_items,
                notes: orderData.notes
            });

            if (calculatedChecksum !== orderData.checksum) {
                throw new Error('Checksum inválido. El archivo puede estar corrupto o modificado.');
            }

            // Check if order already received
            const existingOrder = await client.query(
                'SELECT id, status FROM distribution_orders WHERE order_number = $1',
                [orderData.order_number]
            );

            if (existingOrder.rows.length > 0 && existingOrder.rows[0].status === 'received') {
                throw new Error('Esta orden ya fue recibida anteriormente');
            }

            // Get location name
            const locationResult = await client.query('SELECT name FROM locations WHERE id = $1', [location_id]);
            if (locationResult.rows.length === 0) {
                throw new Error('Ubicación no encontrada');
            }

            // Create stock movements (DISTRIBUTION_IN)
            const notFoundProducts = [];
            for (const line of orderData.lines) {
                // Find product by code
                const productResult = await client.query(
                    'SELECT id, name FROM products WHERE code = $1 OR reference = $1',
                    [line.product_code]
                );

                if (productResult.rows.length === 0) {
                    notFoundProducts.push(line.product_code);
                    continue;
                }

                const product = productResult.rows[0];

                // Insert stock diary entry
                const stockDiaryQuery = `
                    INSERT INTO stockdiary (
                        datenew, reason, location, product, attributesetinstance_id, units, price, concept
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;
                const stockDiaryValues = [
                    formatDate(),
                    -2, // DISTRIBUTION_IN reason (we'll define this as -2)
                    location_id,
                    product.id,
                    null,
                    Math.abs(line.quantity), // Positive for incoming
                    line.unit_cost || 0,
                    `Recepción distribución ${orderData.order_number} desde ${orderData.origin}`
                ];
                await client.query(stockDiaryQuery, stockDiaryValues);

                // Update or insert stockcurrent
                await client.query(`
                    INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (location, product, attributesetinstance_id)
                    DO UPDATE SET units = stockcurrent.units + $4
                `, [location_id, product.id, null, line.quantity]);
            }

            if (notFoundProducts.length > 0) {
                throw new Error(`Productos no encontrados: ${notFoundProducts.join(', ')}`);
            }

            // Update or create distribution order record
            let orderId;
            if (existingOrder.rows.length > 0) {
                orderId = existingOrder.rows[0].id;
                await client.query(`
                    UPDATE distribution_orders 
                    SET status = 'received', 
                        date_received = $1, 
                        dispatch_document_number = $2,
                        received_by = $3,
                        reception_notes = $4
                    WHERE id = $5
                `, [formatDate(), dispatch_document_number, received_by, reception_notes, orderId]);
            } else {
                // Create new record for imported order
                const insertQuery = `
                    INSERT INTO distribution_orders (
                        order_number, dispatch_document_number, origin_location_id, origin_location_name,
                        destination_location_name, date_created, date_received, status, notes,
                        received_by, reception_notes, checksum
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', $8, $9, $10, $11)
                    RETURNING id
                `;
                const insertValues = [
                    orderData.order_number,
                    dispatch_document_number,
                    0, // Unknown origin location ID
                    orderData.origin,
                    orderData.destination,
                    orderData.date_created,
                    formatDate(),
                    orderData.notes,
                    received_by,
                    reception_notes,
                    orderData.checksum
                ];
                const insertResult = await client.query(insertQuery, insertValues);
                orderId = insertResult.rows[0].id;

                // Insert lines
                for (const line of orderData.lines) {
                    const productResult = await client.query(
                        'SELECT id FROM products WHERE code = $1 OR reference = $1',
                        [line.product_code]
                    );

                    if (productResult.rows.length > 0) {
                        await client.query(`
                            INSERT INTO distribution_order_lines (
                                distribution_order_id, product_id, product_name, product_code,
                                quantity_sent, quantity_received, unit_cost
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [orderId, productResult.rows[0].id, line.product_name, line.product_code, line.quantity, line.quantity, line.unit_cost]);
                    }
                }
            }

            await client.query('COMMIT');

            res.json({
                message: 'Distribución recibida exitosamente',
                order_id: orderId,
                order_number: orderData.order_number
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al importar distribución: ' + err.message });
        } finally {
            client.release();
        }
    }
};

module.exports = distributionOrdersController;
