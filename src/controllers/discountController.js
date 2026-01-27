const pool = require('../config/database');

const discountController = {
    // Obtener todos los descuentos
    getAllDiscounts: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM DISCOUNTS ORDER BY NAME');
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching discounts:', err);
            res.status(500).json({ error: 'Error al obtener descuentos' });
        }
    },

    // Crear descuento
    createDiscount: async (req, res) => {
        try {
            const { name, quantity, percentage, idcategory, validfrom, custcategory } = req.body;

            // Ensure we have a valid category ID (required by DB)
            let finalCategoryId = idcategory;
            if (!finalCategoryId) {
                const catResult = await pool.query('SELECT id FROM discountscategories LIMIT 1');
                if (catResult.rows.length > 0) {
                    finalCategoryId = catResult.rows[0].id;
                } else {
                    const newCat = await pool.query("INSERT INTO discountscategories (name) VALUES ('General') RETURNING id");
                    finalCategoryId = newCat.rows[0].id;
                }
            }

            // Default validfrom to current date if not provided
            const finalValidFrom = validfrom || new Date();

            const query = `
                INSERT INTO DISCOUNTS (NAME, QUANTITY, PERCENTAGE, IDCATEGORY, VALIDFROM, CUSTCATEGORY)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            const values = [name, quantity, percentage, finalCategoryId, finalValidFrom, custcategory || null];

            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating discount:', err);
            res.status(500).json({ error: 'Error al crear descuento' });
        }
    },

    // Actualizar descuento
    updateDiscount: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, quantity, percentage, idcategory, validfrom, custcategory } = req.body;

            // Ensure we have a valid category ID (required by DB)
            let finalCategoryId = idcategory;
            if (!finalCategoryId) {
                const catResult = await pool.query('SELECT id FROM discountscategories LIMIT 1');
                if (catResult.rows.length > 0) {
                    finalCategoryId = catResult.rows[0].id;
                } else {
                    // Should exist from create, but just in case
                    const newCat = await pool.query("INSERT INTO discountscategories (name) VALUES ('General') RETURNING id");
                    finalCategoryId = newCat.rows[0].id;
                }
            }

            // Default validfrom to current date if not provided
            const finalValidFrom = validfrom || new Date();

            const query = `
                UPDATE DISCOUNTS
                SET NAME = $1, QUANTITY = $2, PERCENTAGE = $3, IDCATEGORY = $4, VALIDFROM = $5, CUSTCATEGORY = $6
                WHERE ID = $7
                RETURNING *
            `;
            const values = [name, quantity, percentage, finalCategoryId, finalValidFrom, custcategory || null, id];

            const result = await pool.query(query, values);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Descuento no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error updating discount:', err);
            res.status(500).json({ error: 'Error al actualizar descuento' });
        }
    },

    // Eliminar descuento
    deleteDiscount: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('DELETE FROM DISCOUNTS WHERE ID = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Descuento no encontrado' });
            }

            res.json({ message: 'Descuento eliminado exitosamente' });
        } catch (err) {
            console.error('Error deleting discount:', err);
            res.status(500).json({ error: 'Error al eliminar descuento' });
        }
    },

    // Calcular descuento aplicable para un producto y cliente
    getApplicableDiscount: async (req, res) => {
        try {
            const { productId, customerId } = req.body;
            console.log('--- Calculando Descuento ---', { productId, customerId });

            // 1. Obtener la "Lista de Descuento" (idcategory) del producto
            const productRes = await pool.query('SELECT name, discount FROM products WHERE id = $1', [productId]);
            if (productRes.rows.length === 0) return res.json(null);

            const productData = productRes.rows[0];
            let productDiscountCat = parseInt(productData.discount);

            // Si la categoría es 2 (Sin Descuento) o inválida, intentamos buscar en la 1 (General) por si acaso
            // o simplemente aceptamos lo que venga pero con un fallback lógico.
            console.log(`Producto: ${productData.name}, Categoria Original: ${productData.discount}`);

            // 2. Obtener la categoría del cliente
            let customerDiscountCat = null;
            if (customerId) {
                const customerRes = await pool.query('SELECT discountcategory FROM customers WHERE id = $1', [customerId]);
                if (customerRes.rows.length > 0) {
                    customerDiscountCat = customerRes.rows[0].discountcategory;
                }
            }

            // 3. Buscar el mejor descuento
            // Relajamos VALIDFROM a 24 horas a futuro para ignorar CUALQUIER desfase de zona horaria o reloj.
            const discountQuery = `
                SELECT 
                    ID, NAME, QUANTITY, PERCENTAGE, IDCATEGORY, VALIDFROM, CUSTCATEGORY 
                FROM DISCOUNTS 
                WHERE (IDCATEGORY = $1 OR IDCATEGORY = 1) -- Intenta su categoria O la General
                AND (CUSTCATEGORY = $2 OR CUSTCATEGORY IS NULL)
                AND VALIDFROM <= (CURRENT_TIMESTAMP + INTERVAL '1 day')
                ORDER BY 
                    CASE WHEN IDCATEGORY = $1 THEN 0 ELSE 1 END, -- Prioriza su categoria exacta
                    CASE WHEN CUSTCATEGORY = $2 THEN 0 ELSE 1 END, -- Prioriza descuento de cliente
                    VALIDFROM DESC
                LIMIT 1
            `;
            const discountRes = await pool.query(discountQuery, [productDiscountCat, customerDiscountCat]);

            if (discountRes.rows.length > 0) {
                console.log('Descuento aplicado:', discountRes.rows[0].name);
                res.json(discountRes.rows[0]);
            } else {
                console.log('No se encontro ningun descuento aplicable.');
                res.json(null);
            }
        } catch (err) {
            console.error('Error calculando descuento aplicable:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

module.exports = discountController;
