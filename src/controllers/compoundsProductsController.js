const pool = require('../config/database');

const compoundsProductsController = {
    // Obtener todos los insumos de un producto compuesto
    getCompoundProducts: async (req, res) => {
        try {
            const { productId } = req.params;

            const query = `
                SELECT pi.id, pi.idproduct, pi.idinsumo, pi.cantidad, 
                       pi.unidadproduct, pi.unidadinsumo, pi.nameinsumo,
                       p.name as product_name, i.name as insumo_name,
                       u1.name as unidad_product_name, u2.name as unidad_insumo_name
                FROM product_insumos pi
                LEFT JOIN products p ON pi.idproduct = p.id
                LEFT JOIN products i ON pi.idinsumo = i.id
                LEFT JOIN unidades u1 ON pi.unidadproduct = u1.code
                LEFT JOIN unidades u2 ON pi.unidadinsumo = u2.code
                WHERE pi.idproduct = $1
                ORDER BY pi.nameinsumo
            `;

            const result = await pool.query(query, [productId]);
            res.json(result.rows);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener productos compuestos' });
        }
    },

    // Crear una relación producto-insumo
    createCompoundProduct: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { idproduct, idinsumo, cantidad, unidadproduct, unidadinsumo } = req.body;

            // Validaciones
            if (!idproduct || !idinsumo || !cantidad || !unidadproduct || !unidadinsumo) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Todos los campos son obligatorios' });
            }

            if (cantidad <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
            }

            // Verificar que el producto existe
            const productExists = await client.query('SELECT id, name FROM products WHERE id = $1', [idproduct]);
            if (productExists.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            // Verificar que el insumo existe
            const insumoExists = await client.query('SELECT id, name FROM products WHERE id = $1', [idinsumo]);
            if (insumoExists.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Insumo no encontrado' });
            }

            // Verificar que no exista ya esta relación
            const relationExists = await client.query(
                'SELECT id FROM product_insumos WHERE idproduct = $1 AND idinsumo = $2',
                [idproduct, idinsumo]
            );

            if (relationExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Esta relación ya existe' });
            }

            const nameinsumo = insumoExists.rows[0].name;

            // Insertar la relación
            const query = `
                INSERT INTO product_insumos (idproduct, idinsumo, cantidad, unidadproduct, unidadinsumo, nameinsumo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;

            const result = await client.query(query, [
                idproduct, idinsumo, cantidad, unidadproduct, unidadinsumo, nameinsumo
            ]);

            await client.query('COMMIT');
            res.status(201).json(result.rows[0]);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al crear producto compuesto: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Actualizar una relación producto-insumo
    updateCompoundProduct: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id } = req.params;
            const { cantidad, unidadproduct, unidadinsumo } = req.body;

            // Validaciones
            if (!cantidad || !unidadproduct || !unidadinsumo) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Todos los campos son obligatorios' });
            }

            if (cantidad <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
            }

            // Verificar que existe
            const exists = await client.query('SELECT id FROM product_insumos WHERE id = $1', [id]);
            if (exists.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Relación no encontrada' });
            }

            // Actualizar
            const query = `
                UPDATE product_insumos 
                SET cantidad = $1, unidadproduct = $2, unidadinsumo = $3
                WHERE id = $4
                RETURNING *
            `;

            const result = await client.query(query, [cantidad, unidadproduct, unidadinsumo, id]);

            await client.query('COMMIT');
            res.json(result.rows[0]);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar producto compuesto: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Eliminar una relación producto-insumo
    deleteCompoundProduct: async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query('DELETE FROM product_insumos WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Relación no encontrada' });
            }

            res.json({ message: 'Relación eliminada correctamente' });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar relación' });
        }
    },

    // Obtener productos que pueden ser compuestos (typeproduct = 'CO')
    getProductsForCompounds: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const countResult = await pool.query("SELECT COUNT(*) FROM products WHERE typeproduct = 'CO' AND marketable = true");
            const total = parseInt(countResult.rows[0].count);

            const query = `
                SELECT id, name, reference, code, codeunit, typeproduct
                FROM products
                WHERE typeproduct = 'CO' AND marketable = true
                ORDER BY name
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
            res.status(500).json({ error: 'Error al obtener productos' });
        }
    },

    // Obtener productos que pueden ser insumos (typeproduct = 'IN')
    getInsumos: async (req, res) => {
        try {
            const query = `
                SELECT id, name, reference, code, codeunit
                FROM products
                WHERE typeproduct = 'IN'
                ORDER BY name
            `;

            const result = await pool.query(query);
            res.json(result.rows);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener insumos' });
        }
    },

    // Obtener unidades disponibles
    getUnidades: async (req, res) => {
        try {
            const query = `
                SELECT code, name
                FROM unidades
                WHERE activo = true
                ORDER BY name
            `;

            const result = await pool.query(query);
            res.json(result.rows);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener unidades' });
        }
    },

    // Validar si un producto compuesto tiene suficientes insumos en stock
    validateCompoundProductStock: async (req, res) => {
        try {
            const { productId, quantity } = req.query;

            if (!productId || !quantity) {
                return res.status(400).json({ error: 'Producto y cantidad son requeridos' });
            }

            const result = await validateStock(productId, parseFloat(quantity));
            res.json(result);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al validar stock: ' + err.message });
        }
    }
};

// Función auxiliar para validar stock de productos compuestos
async function validateStock(productId, quantity) {
    try {
        // Obtener todos los insumos del producto compuesto
        const insumosQuery = `
            SELECT idinsumo, cantidad, unidadinsumo
            FROM product_insumos
            WHERE idproduct = $1
        `;
        const insumosResult = await pool.query(insumosQuery, [productId]);

        if (insumosResult.rows.length === 0) {
            return {
                hasStock: false,
                message: 'Este producto no tiene insumos asociados',
                details: []
            };
        }

        const details = [];
        let hasStock = true;

        for (const insumo of insumosResult.rows) {
            // Calcular la cantidad necesaria con conversión de unidades
            const requiredQuantity = await calculateUnitFactor(
                insumo.idinsumo,
                productId,
                quantity
            );

            // Obtener stock actual del insumo
            const stockQuery = `
                SELECT COALESCE(SUM(units), 0) as stock
                FROM stockcurrent
                WHERE product = $1
            `;
            const stockResult = await pool.query(stockQuery, [insumo.idinsumo]);
            const currentStock = parseFloat(stockResult.rows[0].stock);

            const insumoDetail = {
                insumoId: insumo.idinsumo,
                requiredQuantity,
                currentStock,
                hasEnough: currentStock >= requiredQuantity
            };

            details.push(insumoDetail);

            if (!insumoDetail.hasEnough) {
                hasStock = false;
            }
        }

        return {
            hasStock,
            message: hasStock ? 'Stock suficiente' : 'Stock insuficiente de uno o más insumos',
            details
        };

    } catch (err) {
        console.error('Error en validateStock:', err);
        throw err;
    }
}

// Función auxiliar para calcular conversión de unidades
async function calculateUnitFactor(insumoId, productId, productQuantity) {
    try {
        // Obtener cantidad del insumo en la receta
        const insumoQuery = `
            SELECT cantidad, unidadinsumo
            FROM product_insumos
            WHERE idinsumo = $1 AND idproduct = $2
        `;
        const insumoResult = await pool.query(insumoQuery, [insumoId, productId]);

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
        const productResult = await pool.query(productQuery, [insumoId]);
        const unidadBase = productResult.rows[0].codeunit;

        // Obtener factor de conversión
        let factor = 1.0;
        if (unidadInsumo !== unidadBase) {
            const conversionQuery = `
                SELECT factor
                FROM unidades_conversion
                WHERE codeunidad = $1 AND codeunidadbase = $2
            `;
            const conversionResult = await pool.query(conversionQuery, [unidadInsumo, unidadBase]);

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

module.exports = compoundsProductsController;
