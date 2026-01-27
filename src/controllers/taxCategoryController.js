const pool = require('../config/database');

const taxCategoryController = {
    // Obtener todas las categorías
    getAll: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM taxcategories ORDER BY name');
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getAll tax categories:', err);
            res.status(500).json({ error: 'Error al obtener categorías de impuestos' });
        }
    },

    // Obtener por ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM taxcategories WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener categoría' });
        }
    },

    // Crear categoría
    create: async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'El nombre es obligatorio' });
            }

            // Validar existencia
            const exists = await pool.query('SELECT id FROM taxcategories WHERE name = $1', [name]);
            if (exists.rows.length > 0) {
                return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
            }

            const result = await pool.query(
                'INSERT INTO taxcategories (name) VALUES ($1) RETURNING *',
                [name]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear categoría' });
        }
    },

    // Actualizar categoría
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'El nombre es obligatorio' });
            }

            const exists = await pool.query('SELECT id FROM taxcategories WHERE id = $1', [id]);
            if (exists.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            // Validar nombre duplicado
            const nameExists = await pool.query('SELECT id FROM taxcategories WHERE name = $1 AND id != $2', [name, id]);
            if (nameExists.rows.length > 0) {
                return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
            }

            const result = await pool.query(
                'UPDATE taxcategories SET name = $1 WHERE id = $2 RETURNING *',
                [name, id]
            );
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar categoría' });
        }
    },

    // Eliminar categoría
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            // Validar uso en taxes
            const usedInTaxes = await pool.query('SELECT id FROM taxes WHERE category = $1', [id]);
            if (usedInTaxes.rows.length > 0) {
                return res.status(400).json({ error: 'No se puede eliminar: La categoría está asignada a uno o más impuestos.' });
            }

            // Validar uso en products (si aplica, products.taxcat)
            // Asumimos que existe la columna taxcat en products basada en el esquema leído previamente
            const usedInProducts = await pool.query('SELECT id FROM products WHERE taxcat = $1', [id]);
            if (usedInProducts.rows.length > 0) {
                return res.status(400).json({ error: 'No se puede eliminar: La categoría está asignada a uno o más productos.' });
            }

            const result = await pool.query('DELETE FROM taxcategories WHERE id = $1 RETURNING *', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }
            res.json({ message: 'Categoría eliminada' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar categoría' });
        }
    }
};

module.exports = taxCategoryController;
