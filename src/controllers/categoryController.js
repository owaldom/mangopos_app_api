const pool = require('../config/database');

const categoryController = {
    // Obtener todas las categorías (con paginación)
    getAllCategories: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            // Obtener total
            const countResult = await pool.query('SELECT COUNT(*) FROM categories');
            const total = parseInt(countResult.rows[0].count);

            // Obtener datos paginados
            const result = await pool.query(
                'SELECT * FROM categories ORDER BY name LIMIT $1 OFFSET $2',
                [limit, offset]
            );

            // Convertir Buffer a Base64
            const categories = result.rows.map(cat => ({
                ...cat,
                image: cat.image ? cat.image.toString('base64') : null
            }));

            // Si se solicita formato de árbol, el frontend lo procesará con la lista completa o paginada según corresponda.
            // Para paginación, devolvemos la estructura plana paginada.
            res.json({
                data: categories,
                total: total,
                page: page,
                limit: limit,
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener categorías' });
        }
    },


    // Obtener una categoría por ID
    getCategoryById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            const cat = result.rows[0];
            if (cat.image) {
                cat.image = cat.image.toString('base64');
            }

            res.json(cat);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener la categoría' });
        }
    },

    // Crear nueva categoría
    createCategory: async (req, res) => {
        try {
            const { name, parentid, image, visible_in_pos } = req.body;

            // Validar que el nombre no exista
            const exists = await pool.query('SELECT id FROM categories WHERE name = $1', [name]);
            if (exists.rows.length > 0) {
                return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
            }

            // Validar parentid si existe
            if (parentid) {
                const parentExists = await pool.query('SELECT id FROM categories WHERE id = $1', [parentid]);
                if (parentExists.rows.length === 0) {
                    return res.status(400).json({ error: 'La categoría padre no existe' });
                }
            }

            let imageBuffer = null;
            if (image) {
                imageBuffer = Buffer.from(image, 'base64');
            }

            const result = await pool.query(
                'INSERT INTO categories (name, parentid, image, visible_in_pos) VALUES ($1, $2, $3, $4) RETURNING *',
                [name, parentid, imageBuffer, visible_in_pos !== undefined ? visible_in_pos : true]
            );

            const newCat = result.rows[0];
            if (newCat.image) newCat.image = newCat.image.toString('base64');

            res.status(201).json(newCat);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear la categoría' });
        }
    },

    // Actualizar categoría
    updateCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, parentid, image, visible_in_pos } = req.body;

            // Verificar que existe
            const category = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
            if (category.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            // Validar nombre único (excluyendo la propia categoría)
            const nameExists = await pool.query(
                'SELECT id FROM categories WHERE name = $1 AND id != $2',
                [name, id]
            );
            if (nameExists.rows.length > 0) {
                return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });
            }

            // Validar referencia circular (no ser padre de sí mismo o de un hijo - simple check id check)
            if (parseInt(parentid) === parseInt(id)) {
                return res.status(400).json({ error: 'Una categoría no puede ser su propio padre' });
            }

            // Nota: Para validación ciclica completa se requeriría una query recursiva, 
            // por ahora se asume uso responsable o validación en frontend.

            let imageBuffer = null;
            // Si viene imagen es string base64 o null. Si es undefined, podríamos no actualizar?
            // Asumimos que el form envía todo el objeto
            if (image) {
                imageBuffer = Buffer.from(image, 'base64');
            }
            // Si image es explicitamente null, guardamos null

            // Usamos coalesce o logica condicional? 
            // Si pasamos imageBuffer (buffer o null), se actualiza.

            const result = await pool.query(
                'UPDATE categories SET name = $1, parentid = $2, image = $3, visible_in_pos = $4 WHERE id = $5 RETURNING *',
                [name, parentid, imageBuffer, visible_in_pos !== undefined ? visible_in_pos : true, id]
            );

            const updatedCat = result.rows[0];
            if (updatedCat.image) updatedCat.image = updatedCat.image.toString('base64');

            res.json(updatedCat);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar la categoría' });
        }
    },

    // Eliminar categoría
    deleteCategory: async (req, res) => {
        try {
            const { id } = req.params;

            // Verificar dependencias: Subcategorías
            const hasChildren = await pool.query('SELECT id FROM categories WHERE parentid = $1', [id]);
            if (hasChildren.rows.length > 0) {
                return res.status(400).json({ error: 'No se puede eliminar: Tiene subcategorías asociadas' });
            }

            // Verificar dependencias: Productos
            const hasProducts = await pool.query('SELECT id FROM products WHERE category = $1', [id]);
            if (hasProducts.rows.length > 0) {
                return res.status(400).json({ error: 'No se puede eliminar: Tiene productos asociados' });
            }

            const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            res.json({ message: 'Categoría eliminada exitosamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar la categoría' });
        }
    }
};

module.exports = categoryController;
