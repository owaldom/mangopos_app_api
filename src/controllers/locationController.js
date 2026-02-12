const pool = require('../config/database');

const locationController = {
    // Get all locations
    getAll: async (req, res) => {
        try {
            const query = 'SELECT * FROM locations ORDER BY name';
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener almacenes' });
        }
    },

    // Get single location by ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const query = 'SELECT * FROM locations WHERE id = $1';
            const result = await pool.query(query, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Almacén no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener el almacén' });
        }
    },

    // Create new location
    create: async (req, res) => {
        try {
            const { name, address, type } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'El nombre es requerido' });
            }

            const query = `
                INSERT INTO locations (name, address, type)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const result = await pool.query(query, [name, address, type || 'factory']);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear el almacén' });
        }
    },

    // Update location
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, address, type } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'El nombre es requerido' });
            }

            const query = `
                UPDATE locations
                SET name = $1, address = $2, type = $3
                WHERE id = $4
                RETURNING *
            `;
            const result = await pool.query(query, [name, address, type || 'factory', id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Almacén no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar el almacén' });
        }
    },

    // Delete location
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            // Check if there is stock associated with this location
            const stockCheck = await pool.query('SELECT COUNT(*) FROM stockcurrent WHERE location = $1', [id]);
            if (parseInt(stockCheck.rows[0].count) > 0) {
                return res.status(400).json({ error: 'No se puede eliminar un almacén que tiene existencias asociadas' });
            }

            // Check if there are distribution orders associated
            const distCheck = await pool.query('SELECT COUNT(*) FROM distribution_orders WHERE origin_location_id = $1', [id]);
            if (parseInt(distCheck.rows[0].count) > 0) {
                return res.status(400).json({ error: 'No se puede eliminar un almacén asociado a órdenes de distribución' });
            }

            const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Almacén no encontrado' });
            }

            res.json({ message: 'Almacén eliminado exitosamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar el almacén' });
        }
    }
};

module.exports = locationController;
