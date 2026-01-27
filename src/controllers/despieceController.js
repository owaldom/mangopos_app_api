const pool = require('../config/database');

// Razones de movimiento para despiece
const REASON_DESPIECE_SALIDA = 5; // Salida por despiece
const REASON_DESPIECE_ENTRADA = 6; // Entrada por despiece

const formatDate = (dateInput) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    const pad = n => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const despieceController = {
    // Listar todas las relaciones de despiece
    getRelaciones: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            const countQuery = 'SELECT COUNT(*) FROM product_disintegration';
            const countResult = await pool.query(countQuery);
            const total = parseInt(countResult.rows[0].count);

            const query = `
                SELECT 
                    pd.id,
                    pd.idproductmayor,
                    pd.idproductmenor,
                    pd.relacion,
                    pm.name as producto_mayor_name,
                    pm.reference as producto_mayor_ref,
                    pm.code as producto_mayor_code,
                    pn.name as producto_menor_name,
                    pn.reference as producto_menor_ref,
                    pn.code as producto_menor_code
                FROM product_disintegration pd
                JOIN products pm ON pd.idproductmayor = pm.id
                JOIN products pn ON pd.idproductmenor = pn.id
                ORDER BY pm.name
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
            res.status(500).json({ error: 'Error al obtener relaciones de despiece' });
        }
    },

    // Obtener relación específica
    getRelacion: async (req, res) => {
        try {
            const { id } = req.params;

            const query = `
                SELECT 
                    pd.id,
                    pd.idproductmayor,
                    pd.idproductmenor,
                    pd.relacion,
                    pm.name as producto_mayor_name,
                    pn.name as producto_menor_name
                FROM product_disintegration pd
                JOIN products pm ON pd.idproductmayor = pm.id
                JOIN products pn ON pd.idproductmenor = pn.id
                WHERE pd.id = $1
            `;

            const result = await pool.query(query, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Relación no encontrada' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener relación' });
        }
    },

    // Obtener relaciones por producto mayor
    getRelacionesByProduct: async (req, res) => {
        try {
            const { productId } = req.params;

            const query = `
                SELECT 
                    pd.id,
                    pd.idproductmayor,
                    pd.idproductmenor,
                    pd.relacion,
                    pm.name as producto_mayor_name,
                    pn.name as producto_menor_name,
                    pn.code as producto_menor_code
                FROM product_disintegration pd
                JOIN products pm ON pd.idproductmayor = pm.id
                JOIN products pn ON pd.idproductmenor = pn.id
                WHERE pd.idproductmayor = $1
            `;

            const result = await pool.query(query, [productId]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener relaciones del producto' });
        }
    },

    // Crear nueva relación
    createRelacion: async (req, res) => {
        try {
            const { idproductmayor, idproductmenor, relacion } = req.body;

            if (!idproductmayor || !idproductmenor || !relacion) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            if (idproductmayor === idproductmenor) {
                return res.status(400).json({ error: 'El producto mayor y menor no pueden ser iguales' });
            }

            // VALIDACIÓN: No permitir despiece para Kits, Compuestos o Servicios como producto origen
            const prodCheck = await pool.query('SELECT typeproduct, servicio, name FROM products WHERE id = $1', [idproductmayor]);
            if (prodCheck.rows.length > 0) {
                const p = prodCheck.rows[0];
                if (p.typeproduct === 'KI' || p.typeproduct === 'CO' || p.servicio === true || p.servicio === '1') {
                    return res.status(400).json({ error: `El producto "${p.name}" no permite despiece (es un Kit, Compuesto o Servicio)` });
                }
            }

            // Verificar que no exista ya esta relación
            const checkQuery = 'SELECT id FROM product_disintegration WHERE idproductmayor = $1 AND idproductmenor = $2';
            const checkResult = await pool.query(checkQuery, [idproductmayor, idproductmenor]);

            if (checkResult.rows.length > 0) {
                return res.status(400).json({ error: 'Ya existe una relación entre estos productos' });
            }

            const insertQuery = `
                INSERT INTO product_disintegration (idproductmayor, idproductmenor, relacion)
                VALUES ($1, $2, $3)
                RETURNING *
            `;

            const result = await pool.query(insertQuery, [idproductmayor, idproductmenor, relacion]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear relación: ' + err.message });
        }
    },

    // Actualizar relación
    updateRelacion: async (req, res) => {
        try {
            const { id } = req.params;
            const { relacion } = req.body;

            if (!relacion || relacion <= 0) {
                return res.status(400).json({ error: 'El factor de conversión debe ser mayor a 0' });
            }

            const updateQuery = `
                UPDATE product_disintegration 
                SET relacion = $1 
                WHERE id = $2
                RETURNING *
            `;

            const result = await pool.query(updateQuery, [relacion, id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Relación no encontrada' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar relación' });
        }
    },

    // Eliminar relación
    deleteRelacion: async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query('DELETE FROM product_disintegration WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Relación no encontrada' });
            }

            res.json({ message: 'Relación eliminada correctamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar relación' });
        }
    },

    // Ejecutar despiece
    ejecutarDespiece: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { idproductmayor, idproductmenor, cantidad, location } = req.body;

            // Validar campos
            if (!idproductmayor || !idproductmenor || !cantidad || !location) {
                throw new Error('Faltan campos requeridos');
            }

            if (cantidad <= 0) {
                throw new Error('La cantidad debe ser mayor a 0');
            }

            // VALIDACIÓN: No permitir despiece para Kits, Compuestos o Servicios como producto origen
            const prodCheck = await client.query('SELECT typeproduct, servicio, name FROM products WHERE id = $1', [idproductmayor]);
            if (prodCheck.rows.length > 0) {
                const p = prodCheck.rows[0];
                if (p.typeproduct === 'KI' || p.typeproduct === 'CO' || p.servicio === true || p.servicio === '1') {
                    throw new Error(`El producto "${p.name}" no permite despiece (es un Kit, Compuesto o Servicio)`);
                }
            }

            // Obtener la relación de despiece
            const relacionQuery = `
                SELECT relacion FROM product_disintegration 
                WHERE idproductmayor = $1 AND idproductmenor = $2
            `;
            const relacionResult = await client.query(relacionQuery, [idproductmayor, idproductmenor]);

            if (relacionResult.rows.length === 0) {
                throw new Error('No existe una relación de despiece entre estos productos');
            }

            const factorConversion = parseFloat(relacionResult.rows[0].relacion);

            // Verificar stock disponible del producto mayor
            const stockQuery = `
                SELECT units FROM stockcurrent 
                WHERE product = $1 AND location = $2 
                AND (attributesetinstance_id IS NULL OR attributesetinstance_id = 0)
            `;
            const stockResult = await client.query(stockQuery, [idproductmayor, location]);

            const stockDisponible = stockResult.rows.length > 0 ? parseFloat(stockResult.rows[0].units) : 0;

            if (stockDisponible < cantidad) {
                throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}, Solicitado: ${cantidad}`);
            }

            // Calcular unidades a generar
            const unidadesGeneradas = cantidad * factorConversion;

            // Obtener datos detallados de los productos
            const productInfoQuery = 'SELECT id, name, pricebuy FROM products WHERE id = $1 OR id = $2';
            const productInfoResult = await client.query(productInfoQuery, [idproductmayor, idproductmenor]);

            const productMayor = productInfoResult.rows.find(p => p.id === idproductmayor);
            const productMenor = productInfoResult.rows.find(p => p.id === idproductmenor);

            if (!productMayor || !productMenor) {
                throw new Error('No se pudo encontrar información de los productos');
            }

            const precioMayor = parseFloat(productMayor.pricebuy) || 0;
            const precioMenor = parseFloat(productMenor.pricebuy) || 0;
            const nombreMayor = productMayor.name;
            const nombreMenor = productMenor.name;

            const fechaActual = formatDate(new Date());

            // 1. Registrar salida del producto mayor
            await client.query(`
                INSERT INTO stockdiary (datenew, reason, location, product, attributesetinstance_id, units, price, concept)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [fechaActual, REASON_DESPIECE_SALIDA, location, idproductmayor, null, -cantidad, precioMayor, `Despiece (Origen) -> ${nombreMenor}`]);

            // 2. Actualizar stock del producto mayor (restar)
            await client.query(`
                INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (location, product, attributesetinstance_id) 
                DO UPDATE SET units = stockcurrent.units - $4
            `, [location, idproductmayor, null, cantidad]);

            // 3. Registrar entrada del producto menor
            await client.query(`
                INSERT INTO stockdiary (datenew, reason, location, product, attributesetinstance_id, units, price, concept)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [fechaActual, REASON_DESPIECE_ENTRADA, location, idproductmenor, null, unidadesGeneradas, precioMenor, `Despiece (Resultado) <- ${nombreMayor}`]);

            // 4. Actualizar stock del producto menor (sumar)
            await client.query(`
                INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (location, product, attributesetinstance_id) 
                DO UPDATE SET units = stockcurrent.units + $4
            `, [location, idproductmenor, null, unidadesGeneradas]);

            await client.query('COMMIT');

            res.status(201).json({
                message: 'Despiece ejecutado correctamente',
                cantidadDespiezada: cantidad,
                unidadesGeneradas: unidadesGeneradas,
                factorConversion: factorConversion
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al ejecutar despiece: ' + err.message });
        } finally {
            client.release();
        }
    }
};

module.exports = despieceController;
