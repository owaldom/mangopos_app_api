const pool = require('../config/database');

const productKitsController = {
    // Obtener los componentes de un Kit
    getKitComponents: async (req, res) => {
        try {
            const { kitId } = req.params;
            const query = `
                SELECT pk.id, pk.component_id, pk.quantity, pk.group_id, pk.group_name, pk.is_mandatory,
                       p.name as component_name, p.reference as component_reference, p.code as component_code,
                       p.pricesell as component_price
                FROM product_kits pk
                JOIN products p ON pk.component_id = p.id
                WHERE pk.kit_id = $1
                ORDER BY pk.group_id, p.name
            `;
            const result = await pool.query(query, [kitId]);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener componentes del kit' });
        }
    },

    // Guardar (actualizar) componentes de un Kit
    // Recibe kitId y array de componentes
    saveKit: async (req, res) => {
        const client = await pool.connect();
        try {
            const { kitId } = req.params;
            const { components } = req.body; // Array of { component_id, quantity, group_id, group_name, is_mandatory }

            await client.query('BEGIN');

            // 1. Eliminar anteriores (para sobreescribir)
            await client.query('DELETE FROM product_kits WHERE kit_id = $1', [kitId]);

            // 2. Insertar nuevos
            for (const comp of components) {
                const insertQuery = `
                    INSERT INTO product_kits (kit_id, component_id, quantity, group_id, group_name, is_mandatory)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `;
                await client.query(insertQuery, [
                    kitId,
                    comp.component_id,
                    comp.quantity || 1,
                    comp.group_id || null,
                    comp.group_name || null,
                    comp.is_mandatory !== undefined ? comp.is_mandatory : true
                ]);
            }

            await client.query('COMMIT');
            res.json({ message: 'Kit actualizado exitosamente' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al guardar el kit' });
        } finally {
            client.release();
        }
    },

    // Obtener productos elegibles para ser kits (Header)
    // Filtra por typeproduct = 'KI'
    getKitHeaders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const countResult = await pool.query("SELECT COUNT(*) FROM products WHERE typeproduct = 'KI' AND marketable = true");
            const total = parseInt(countResult.rows[0].count);

            const query = `
                SELECT id, name, reference, code, pricesell
                FROM products 
                WHERE typeproduct = 'KI' AND marketable = true
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
            res.status(500).json({ error: 'Error al obtener encabezados de kits' });
        }
    },

    // Obtener productos elegibles para ser componentes
    // Usualmente SI (Simple) o SE (Service), evitando KI (Kit) para no anidar recursivamente por ahora
    getEligibleComponents: async (req, res) => {
        try {
            const query = `
                SELECT id, name, reference, code, pricesell, typeproduct
                FROM products
                WHERE typeproduct != 'KI' AND marketable = true
                ORDER BY name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener productos candidatos' });
        }
    },

    // Validar si un kit tiene suficientes componentes en stock
    validateStock: async (req, res) => {
        try {
            const { kitId, quantity } = req.query;

            if (!kitId || !quantity) {
                return res.status(400).json({ error: 'Kit y cantidad son requeridos' });
            }

            const kitQuantity = parseFloat(quantity);

            // 1. Obtener componentes definidos por defecto
            const kitDefRes = await pool.query(
                'SELECT component_id, quantity FROM product_kits WHERE kit_id = $1',
                [kitId]
            );
            const components = kitDefRes.rows;

            if (components.length === 0) {
                return res.json({ hasStock: true, message: 'Kit sin componentes o virtual' });
            }

            const details = [];
            let hasStock = true;

            // 2. Procesar cada componente
            for (const comp of components) {
                const finalQuantity = comp.quantity * kitQuantity;

                // Obtener stock actual del componente
                const stockRes = await pool.query(
                    'SELECT COALESCE(SUM(units), 0) as stock FROM stockcurrent WHERE product = $1 AND location = 1',
                    [comp.component_id]
                );
                const currentStock = parseFloat(stockRes.rows[0].stock);

                const itemDetail = {
                    productId: comp.component_id,
                    requiredQuantity: finalQuantity,
                    currentStock,
                    hasEnough: currentStock >= finalQuantity
                };

                details.push(itemDetail);

                if (!itemDetail.hasEnough) {
                    hasStock = false;
                }
            }

            res.json({
                hasStock,
                message: hasStock ? 'Stock suficiente' : 'Stock insuficiente de uno o más componentes',
                details
            });

        } catch (err) {
            console.error('Error en validateKitStock:', err);
            res.status(500).json({ error: 'Error al validar stock del kit: ' + err.message });
        }
    }
};

module.exports = productKitsController;
