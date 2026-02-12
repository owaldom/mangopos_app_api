const pool = require('../config/database');

const productController = {
    // Obtener productos con paginación y búsqueda
    getAllProducts: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const category = req.query.category;
            const name = req.query.name;
            const code = req.query.code;
            const typeproduct = req.query.typeproduct;
            const servicio = req.query.servicio;
            const isscale = req.query.isscale;
            const regulated = req.query.regulated;
            const marketable = req.query.marketable;
            const iscom = req.query.iscom;
            const incatalog = req.query.incatalog;
            const locationId = req.query.locationId;

            let queryParams = [];
            let whereConditions = [];
            let paramIndex = 1;

            // locationId is handled inside the data query for stock_current, 
            // no longer as a strict filter for the product list (EXISTS)
            // to allow adding stock to products without current inventory.

            if (search) {
                whereConditions.push(`(p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR p.reference ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            if (name) {
                whereConditions.push(`p.name ILIKE $${paramIndex}`);
                queryParams.push(`%${name}%`);
                paramIndex++;
            }

            if (code) {
                whereConditions.push(`(p.code ILIKE $${paramIndex} OR p.reference ILIKE $${paramIndex})`);
                queryParams.push(`%${code}%`);
                paramIndex++;
            }

            if (category && category !== 'all' && category !== 'null') {
                whereConditions.push(`p.category = $${paramIndex}`);
                queryParams.push(category);
                paramIndex++;
            }

            if (typeproduct) {
                whereConditions.push(`p.typeproduct = $${paramIndex}`);
                queryParams.push(typeproduct);
                paramIndex++;
            }

            if (servicio !== undefined && servicio !== '') {
                whereConditions.push(`p.servicio = $${paramIndex}`);
                queryParams.push(servicio === 'true');
                paramIndex++;
            }

            if (isscale !== undefined && isscale !== '') {
                whereConditions.push(`p.isscale = $${paramIndex}`);
                queryParams.push(isscale === 'true');
                paramIndex++;
            }

            if (regulated !== undefined && regulated !== '') {
                whereConditions.push(`p.regulated = $${paramIndex}`);
                queryParams.push(regulated === 'true');
                paramIndex++;
            }

            if (marketable !== undefined && marketable !== '') {
                whereConditions.push(`p.marketable = $${paramIndex}`);
                queryParams.push(marketable === 'true');
                paramIndex++;
            }

            if (iscom !== undefined && iscom !== '') {
                whereConditions.push(`p.iscom = $${paramIndex}`);
                queryParams.push(iscom === 'true');
                paramIndex++;
            }

            if (incatalog !== undefined && incatalog !== '') {
                if (incatalog === 'true') {
                    whereConditions.push(`EXISTS (SELECT 1 FROM products_cat pc WHERE pc.product = p.id)`);
                } else {
                    whereConditions.push(`NOT EXISTS (SELECT 1 FROM products_cat pc WHERE pc.product = p.id)`);
                }
            }

            let whereClause = '';
            if (whereConditions.length > 0) {
                whereClause = 'WHERE ' + whereConditions.join(' AND ');
            }

            // Count Query
            const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
            const countResult = await pool.query(countQuery, queryParams);
            const total = parseInt(countResult.rows[0].count);

            // Preparar el sub-filtro de ubicación para la consulta de datos
            let stockLocationFilter = '';
            if (locationId && locationId !== 'null' && locationId !== '0') {
                stockLocationFilter = `AND location = $${paramIndex}`;
                queryParams.push(locationId);
                paramIndex++;
            }

            // Data Query
            let query = `
                SELECT p.*, c.name as category_name, t.name as tax_name,
                CASE WHEN pc.product IS NOT NULL THEN true ELSE false END as incatalog,
                (SELECT COALESCE(SUM(units), 0) FROM stockcurrent WHERE product = p.id ${stockLocationFilter}) as stock_current,
                p.servicio
                FROM products p
                LEFT JOIN categories c ON p.category = c.id
                LEFT JOIN taxcategories t ON p.taxcat = t.id
                LEFT JOIN products_cat pc ON p.id = pc.product
                ${whereClause}
                ORDER BY p.name 
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            // Add pagination params
            queryParams.push(limit);
            queryParams.push(offset);

            const result = await pool.query(query, queryParams);

            // Convert images
            const products = result.rows.map(p => ({
                ...p,
                image: p.image ? p.image.toString('base64') : null
            }));

            res.json({
                data: products,
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

    // Obtener producto por ID
    getProductById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(`
        SELECT p.*, 
        CASE WHEN pc.product IS NOT NULL THEN true ELSE false END as incatalog 
        FROM products p
        LEFT JOIN products_cat pc ON p.id = pc.product
        WHERE p.id = $1
      `, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            const product = result.rows[0];
            if (product.image) {
                product.image = product.image.toString('base64');
            }

            res.json(product);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener el producto' });
        }
    },

    // Crear producto
    createProduct: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                reference, code, name, pricebuy, pricesell, category, taxcat,
                stockcost, stockvolume, iscom, isscale, image, incatalog,
                codetype, attributeset_id, discount, regulated, servicio,
                averagecost, marketable, codeunit, typeproduct
            } = req.body;

            // Validaciones básicas
            const refExists = await client.query('SELECT id FROM products WHERE reference = $1', [reference]);
            if (refExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La referencia ya existe' });
            }

            const codeExists = await client.query('SELECT id FROM products WHERE code = $1', [code]);
            if (codeExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'El código ya existe' });
            }

            let imageBuffer = null;
            if (image) {
                imageBuffer = Buffer.from(image, 'base64');
            }

            // Insertar Producto
            const query = `
        INSERT INTO products (
          reference, code, name, pricebuy, pricesell, category, taxcat, 
          stockcost, stockvolume, iscom, isscale, image,
          codetype, attributeset_id, discount, regulated, servicio,
          averagecost, marketable, codeunit, typeproduct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *
      `;

            const values = [
                reference, code, name, pricebuy, pricesell, category, taxcat,
                stockcost || 0, stockvolume || 0, iscom || false, isscale || false, imageBuffer,
                codetype || 'CODE128', attributeset_id || null, discount || '001', regulated || false, servicio || false,
                averagecost || 0, marketable !== undefined ? marketable : true, codeunit || 'KG', typeproduct || 'SI'
            ];

            const result = await client.query(query, values);
            const newProduct = result.rows[0];

            // Insertar en Catálogo si aplica
            if (incatalog) {
                await client.query('INSERT INTO products_cat (product, catorder) VALUES ($1, $2)', [newProduct.id, 0]);
            }

            if (newProduct.image) newProduct.image = newProduct.image.toString('base64');

            await client.query('COMMIT');
            res.status(201).json({ ...newProduct, incatalog });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al crear producto: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Actualizar producto
    updateProduct: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id } = req.params;
            const {
                reference, code, name, pricebuy, pricesell, category, taxcat,
                stockcost, stockvolume, iscom, isscale, image, incatalog,
                codetype, attributeset_id, discount, regulated, servicio,
                averagecost, marketable, codeunit, typeproduct
            } = req.body;

            // Verificar existencia
            const exists = await client.query('SELECT id FROM products WHERE id = $1', [id]);
            if (exists.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Producto no encontrado' });
            }

            // Validar duplicados (excluyendo el actual)
            const refExists = await client.query('SELECT id FROM products WHERE reference = $1 AND id != $2', [reference, id]);
            if (refExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La referencia ya existe' });
            }

            const codeExists = await client.query('SELECT id FROM products WHERE code = $1 AND id != $2', [code, id]);
            if (codeExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'El código ya existe' });
            }

            let imageBuffer = null;
            if (image) {
                imageBuffer = Buffer.from(image, 'base64');
            }

            // Actualizar Producto
            const query = `
        UPDATE products SET
          reference = $1, code = $2, name = $3, pricebuy = $4, pricesell = $5, 
          category = $6, taxcat = $7, stockcost = $8, stockvolume = $9, 
          iscom = $10, isscale = $11, image = $12,
          codetype = $13, attributeset_id = $14, discount = $15, regulated = $16, usuario = $17, -- ERROR: servicio param logic
          averagecost = $18, marketable = $19, codeunit = $20, typeproduct = $21
        WHERE id = $22
        RETURNING *
      `;

            // Fix query logic for update
            const updateQuery = `
                 UPDATE products SET
                  reference = $1, code = $2, name = $3, pricebuy = $4, pricesell = $5, 
                  category = $6, taxcat = $7, stockcost = $8, stockvolume = $9, 
                  iscom = $10, isscale = $11, image = $12,
                  codetype = $13, attributeset_id = $14, discount = $15, regulated = $16, servicio = $17,
                  averagecost = $18, marketable = $19, codeunit = $20, typeproduct = $21
                WHERE id = $22
                RETURNING *
            `;


            const values = [
                reference, code, name, pricebuy, pricesell, category, taxcat,
                stockcost, stockvolume, iscom, isscale, imageBuffer,
                codetype, attributeset_id, discount, regulated, servicio,
                averagecost, marketable, codeunit, typeproduct,
                id
            ];

            const result = await client.query(updateQuery, values);
            const updatedProduct = result.rows[0];

            // Actualizar Catálogo
            await client.query('DELETE FROM products_cat WHERE product = $1', [id]);

            if (incatalog) {
                await client.query('INSERT INTO products_cat (product, catorder) VALUES ($1, $2)', [id, 0]);
            }

            if (updatedProduct.image) updatedProduct.image = updatedProduct.image.toString('base64');

            await client.query('COMMIT');
            res.json({ ...updatedProduct, incatalog });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar producto: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Eliminar producto
    deleteProduct: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }


            res.json({ message: 'Producto eliminado' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar producto (posiblemente esté en uso)' });
        }
    },

    // Filtrar productos para cambio de precios
    filterForPriceChange: async (req, res) => {
        try {
            const {
                barcode,
                name,
                categoryId,
                priceBuyMin,
                priceBuyMax,
                priceSellMin,
                priceSellMax
            } = req.query;

            let query = `
                SELECT p.id, p.reference, p.code, p.name, p.pricebuy, p.pricesell, 
                       c.name as category_name, p.category
                FROM products p
                LEFT JOIN categories c ON p.category = c.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;

            if (barcode) {
                query += ` AND (p.code ILIKE $${paramIndex} OR p.reference ILIKE $${paramIndex})`;
                params.push(`%${barcode}%`);
                paramIndex++;
            }

            if (name) {
                query += ` AND p.name ILIKE $${paramIndex}`;
                params.push(`%${name}%`);
                paramIndex++;
            }

            if (categoryId) {
                query += ` AND p.category = $${paramIndex}`;
                params.push(categoryId);
                paramIndex++;
            }

            if (priceBuyMin) {
                query += ` AND p.pricebuy >= $${paramIndex}`;
                params.push(parseFloat(priceBuyMin));
                paramIndex++;
            }

            if (priceBuyMax) {
                query += ` AND p.pricebuy <= $${paramIndex}`;
                params.push(parseFloat(priceBuyMax));
                paramIndex++;
            }

            if (priceSellMin) {
                query += ` AND p.pricesell >= $${paramIndex}`;
                params.push(parseFloat(priceSellMin));
                paramIndex++;
            }

            if (priceSellMax) {
                query += ` AND p.pricesell <= $${paramIndex}`;
                params.push(parseFloat(priceSellMax));
                paramIndex++;
            }

            query += ' ORDER BY p.name LIMIT 500';

            const result = await pool.query(query, params);
            res.json(result.rows);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al filtrar productos' });
        }
    },

    // Cambio masivo de precios
    bulkPriceChange: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { productIds, changeType, changeAction, changeValue } = req.body;

            // Validaciones
            if (!productIds || productIds.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Debe seleccionar al menos un producto' });
            }

            if (!changeValue || changeValue <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'El valor de cambio debe ser mayor a 0' });
            }

            let updateQuery = '';

            // Construir query según tipo y acción
            if (changeAction === 'increase') {
                if (changeType === 'percentage') {
                    // Aumento por porcentaje
                    updateQuery = `
                        UPDATE products 
                        SET pricesell = ROUND((pricesell + ((pricesell * $1) / 100))::numeric, 2)
                        WHERE id = ANY($2::int[])
                        RETURNING id, name, reference, pricesell
                    `;
                } else {
                    // Aumento por monto
                    updateQuery = `
                        UPDATE products 
                        SET pricesell = ROUND((pricesell + $1)::numeric, 2)
                        WHERE id = ANY($2::int[])
                        RETURNING id, name, reference, pricesell
                    `;
                }
            } else {
                if (changeType === 'percentage') {
                    // Disminución por porcentaje
                    updateQuery = `
                        UPDATE products 
                        SET pricesell = ROUND((pricesell - ((pricesell * $1) / 100))::numeric, 2)
                        WHERE id = ANY($2::int[])
                        AND ROUND((pricesell - ((pricesell * $1) / 100))::numeric, 2) > 0
                        RETURNING id, name, reference, pricesell
                    `;
                } else {
                    // Disminución por monto
                    updateQuery = `
                        UPDATE products 
                        SET pricesell = ROUND((pricesell - $1)::numeric, 2)
                        WHERE id = ANY($2::int[])
                        AND ROUND((pricesell - $1)::numeric, 2) > 0
                        RETURNING id, name, reference, pricesell
                    `;
                }
            }

            const result = await client.query(updateQuery, [changeValue, productIds]);

            await client.query('COMMIT');

            res.json({
                message: 'Precios actualizados correctamente',
                updatedCount: result.rows.length,
                products: result.rows
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar precios: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Cambio individual de precio
    updateProductPrice: async (req, res) => {
        try {
            const { id } = req.params;
            const { newPrice } = req.body;

            // Validaciones
            if (!newPrice || newPrice <= 0) {
                return res.status(400).json({ error: 'El precio debe ser mayor a 0' });
            }

            const result = await pool.query(
                'UPDATE products SET pricesell = $1 WHERE id = $2 RETURNING id, name, reference, pricesell',
                [newPrice, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            res.json({
                message: 'Precio actualizado correctamente',
                product: result.rows[0]
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar precio: ' + err.message });
        }
    }
};

module.exports = productController;
