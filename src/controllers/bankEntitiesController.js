const pool = require('../config/database');

const bankEntitiesController = {
    getAll: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM bank_entities ORDER BY name ASC');
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching bank entities:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM bank_entities WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bank entity not found' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching bank entity:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    create: async (req, res) => {
        try {
            const { name, code, logo } = req.body;
            const result = await pool.query(
                'INSERT INTO bank_entities (name, code, logo) VALUES ($1, $2, $3) RETURNING *',
                [name, code, logo]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating bank entity:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, code, logo, active } = req.body;
            const result = await pool.query(
                'UPDATE bank_entities SET name = $1, code = $2, logo = $3, active = $4 WHERE id = $5 RETURNING *',
                [name, code, logo, active, id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bank entity not found' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating bank entity:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM bank_entities WHERE id = $1', [id]);
            res.json({ message: 'Bank entity deleted successfully' });
        } catch (error) {
            console.error('Error deleting bank entity:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = bankEntitiesController;
