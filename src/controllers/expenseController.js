const pool = require('../config/database');

const expenseController = {
    // Obtener todos los tipos de gastos
    getAll: async (req, res) => {
        try {
            const { search, page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            let whereConditions = ['g.visible = true'];
            let params = [];
            let paramIdx = 1;

            if (search) {
                whereConditions.push(`g.name ILIKE $${paramIdx}`);
                params.push(`%${search}%`);
                paramIdx++;
            }

            const whereClause = 'WHERE ' + whereConditions.join(' AND ');

            // Count total
            const countResult = await pool.query(`SELECT COUNT(*) FROM gastos g ${whereClause}`, params);
            const total = parseInt(countResult.rows[0].count);

            // Fetch data with supplier and tax info
            const dataResult = await pool.query(
                `SELECT g.*, 
                    t.name as supplier_name,
                    tc.name as taxcat_name
                FROM gastos g
                LEFT JOIN thirdparties t ON g.idsupplier = t.id
                LEFT JOIN taxcategories tc ON g.taxcat = tc.id
                ${whereClause} 
                ORDER BY g.name 
                LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
                [...params, limit, offset]
            );

            res.json({
                data: dataResult.rows,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener tipos de gastos' });
        }
    },

    // Obtener tipo de gasto por ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(
                `SELECT g.*, 
                    t.name as supplier_name,
                    tc.name as taxcat_name
                FROM gastos g
                LEFT JOIN thirdparties t ON g.idsupplier = t.id
                LEFT JOIN taxcategories tc ON g.taxcat = tc.id
                WHERE g.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Tipo de gasto no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener tipo de gasto' });
        }
    },

    // Crear nuevo tipo de gasto
    create: async (req, res) => {
        try {
            const { name, frequency, idsupplier, taxcat } = req.body;

            if (!name || !frequency || !idsupplier) {
                return res.status(400).json({ error: 'Nombre, frecuencia y proveedor son requeridos' });
            }

            const result = await pool.query(
                `INSERT INTO gastos (name, frequency, idsupplier, taxcat, visible) 
                 VALUES ($1, $2, $3, $4, true) 
                 RETURNING *`,
                [name, frequency, idsupplier, taxcat || null]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear tipo de gasto' });
        }
    },

    // Actualizar tipo de gasto
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, frequency, idsupplier, taxcat, visible } = req.body;

            const result = await pool.query(
                `UPDATE gastos 
                 SET name = $1, frequency = $2, idsupplier = $3, taxcat = $4, visible = $5
                 WHERE id = $6 
                 RETURNING *`,
                [name, frequency, idsupplier, taxcat || null, visible !== undefined ? visible : true, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Tipo de gasto no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar tipo de gasto' });
        }
    },

    // Eliminar (soft delete) tipo de gasto
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            // Check if there are daily expenses associated
            const checkResult = await pool.query(
                'SELECT COUNT(*) FROM gastos_diarios WHERE idgasto = $1',
                [id]
            );

            if (parseInt(checkResult.rows[0].count) > 0) {
                return res.status(400).json({
                    error: 'No se puede eliminar este tipo de gasto porque tiene registros asociados'
                });
            }

            const result = await pool.query(
                'UPDATE gastos SET visible = false WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Tipo de gasto no encontrado' });
            }

            res.json({ message: 'Tipo de gasto eliminado exitosamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar tipo de gasto' });
        }
    }
};

module.exports = expenseController;
