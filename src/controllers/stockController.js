const pool = require('../config/database');
const formatDate = (dateInput) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    const pad = n => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const stockController = {
    // Obtener historial de movimientos
    getStockMovements: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            const countQuery = 'SELECT COUNT(*) FROM stockdiary';
            const countResult = await pool.query(countQuery);
            const total = parseInt(countResult.rows[0].count);

            const query = `
        SELECT 
            sd.id, sd.datenew, sd.reason, sd.units, sd.price, sd.concept,
            p.name as product_name, p.reference as product_reference,
            l.name as location_name
        FROM stockdiary sd
        JOIN products p ON sd.product = p.id
        JOIN locations l ON sd.location = l.id
        ORDER BY sd.datenew DESC
        LIMIT $1 OFFSET $2
      `;

            const result = await pool.query(query, [limit, offset]);

            res.json({
                data: result.rows,
                total: total,
                page: page,
                limit: limit,
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener movimientos' });
        }
    },

    // Obtener stock actual por producto
    getProductStock: async (req, res) => {
        try {
            const { productId } = req.params;

            const query = `
            SELECT sc.units, l.name as location_name
            FROM stockcurrent sc
            JOIN locations l ON sc.location = l.id
            WHERE sc.product = $1
          `;

            const result = await pool.query(query, [productId]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener stock del producto' });
        }
    },

    // Obtener almacenes
    getLocations: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM locations ORDER BY name');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener almacenes' });
        }
    },

    // Crear movimiento de stock
    createStockMovement: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                date, reason, location, product, units, price, concept
            } = req.body;

            // VALIDACIÓN: No permitir movimientos para Kits, Compuestos o Servicios
            const prodCheck = await client.query('SELECT typeproduct, servicio, name FROM products WHERE id = $1', [product]);
            if (prodCheck.rows.length > 0) {
                const p = prodCheck.rows[0];
                if (p.typeproduct === 'KI' || p.typeproduct === 'CO' || p.servicio === true || p.servicio === '1') {
                    throw new Error(`El producto "${p.name}" no permite movimientos manuales de stock (es un Kit, Compuesto o Servicio)`);
                }
            }

            // 1. Insertar en stockdiary
            const insertDiaryQuery = `
        INSERT INTO stockdiary (
            datenew, reason, location, product, attributesetinstance_id, units, price, concept
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

            const valuesDiary = [
                formatDate(date),
                reason,
                location,
                product,
                null,
                units,
                price || 0,
                concept
            ];

            const diaryResult = await client.query(insertDiaryQuery, valuesDiary);

            // 2. Actualizar o Insertar stockcurrent
            await client.query(`
                INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (location, product, attributesetinstance_id) 
                DO UPDATE SET units = stockcurrent.units + $4
            `, [location, product, null, units]);

            await client.query('COMMIT');
            res.status(201).json(diaryResult.rows[0]);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al crear movimiento de stock: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Crear movimientos masivos (Bulk)
    createBulkStockMovement: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                date, reason, location, lines
            } = req.body;

            if (!lines || lines.length === 0) {
                throw new Error("No hay líneas de movimiento para procesar");
            }

            const insertedIds = [];
            const movementDate = formatDate(date);

            for (const line of lines) {
                // VALIDACIÓN: No permitir movimientos para Kits, Compuestos o Servicios
                const prodCheck = await client.query('SELECT typeproduct, servicio, name FROM products WHERE id = $1', [line.product]);
                if (prodCheck.rows.length > 0) {
                    const p = prodCheck.rows[0];
                    if (p.typeproduct === 'KI' || p.typeproduct === 'CO' || p.servicio === true || p.servicio === '1') {
                        throw new Error(`El producto "${p.name}" no permite movimientos manuales de stock (es un Kit, Compuesto o Servicio)`);
                    }
                }

                // 1. Insert stockdiary
                const valuesDiary = [
                    movementDate,
                    reason,
                    location,
                    line.product,
                    line.attributesetinstance_id || null,
                    line.units,
                    line.price || 0,
                    line.concept || ''
                ];

                const insertQuery = `
                    INSERT INTO stockdiary (
                        datenew, reason, location, product, attributesetinstance_id, units, price, concept
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                `;

                const resDiary = await client.query(insertQuery, valuesDiary);
                insertedIds.push(resDiary.rows[0].id);

                // 2. Update or Insert stockcurrent
                await client.query(`
                    INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (location, product, attributesetinstance_id) 
                    DO UPDATE SET units = stockcurrent.units + $4
                `, [location, line.product, line.attributesetinstance_id || null, line.units]);
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Movimientos creados exitosamente', count: insertedIds.length, ids: insertedIds });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al procesar movimientos masivos: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Obtener reporte de Stock Bajo
    getLowStockReport: async (req, res) => {
        try {
            const { categoryId, search } = req.query;

            let query = `
                SELECT 
                    p.id, p.reference, p.code, p.name, p.stockvolume as min_stock, 
                    COALESCE(SUM(sc.units), 0) as current_stock,
                    c.name as category_name
                FROM products p
                LEFT JOIN stockcurrent sc ON p.id = sc.product
                LEFT JOIN categories c ON p.category = c.id
                WHERE (p.typeproduct IS NULL OR p.typeproduct NOT IN ('KI', 'CO'))
                  AND (p.servicio IS NULL OR (p.servicio != true AND p.servicio != '1'))
            `;

            const params = [];
            let paramCount = 1;

            if (categoryId) {
                query += ` AND p.category = $${paramCount}`;
                params.push(categoryId);
                paramCount++;
            }

            if (search) {
                query += ` AND (p.name ILIKE $${paramCount} OR p.code ILIKE $${paramCount} OR p.reference ILIKE $${paramCount})`;
                params.push(`%${search}%`);
                paramCount++;
            }

            query += `
                GROUP BY p.id, p.reference, p.code, p.name, p.stockvolume, c.name
                HAVING COALESCE(SUM(sc.units), 0) <= p.stockvolume
                ORDER BY p.name
            `;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener reporte de stock bajo' });
        }
    }
};

module.exports = stockController;
