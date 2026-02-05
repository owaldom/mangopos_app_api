const pool = require('../config/database');

const bankAccountTypesController = {
    getAll: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM bank_account_types ORDER BY name ASC');
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching bank account types:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM bank_account_types WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Account type not found' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching bank account type:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    create: async (req, res) => {
        try {
            const { name, description } = req.body;
            const result = await pool.query(
                'INSERT INTO bank_account_types (name, description) VALUES ($1, $2) RETURNING *',
                [name, description]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating bank account type:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, active } = req.body;
            const result = await pool.query(
                'UPDATE bank_account_types SET name = $1, description = $2, active = $3 WHERE id = $4 RETURNING *',
                [name, description, active, id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Account type not found' });
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating bank account type:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM bank_account_types WHERE id = $1', [id]);
            res.json({ message: 'Account type deleted successfully' });
        } catch (error) {
            console.error('Error deleting bank account type:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = bankAccountTypesController;
