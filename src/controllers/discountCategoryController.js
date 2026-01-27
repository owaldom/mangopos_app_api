const pool = require('../config/database');

const discountCategoryController = {
    // Get all discount categories
    getAllDiscountCategories: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM discountscategories ORDER BY NAME');
            res.json(result.rows);
        } catch (err) {
            console.error('Error executing query', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Create a new discount category (Basic helper)
    createDiscountCategory: async (req, res) => {
        try {
            const { name } = req.body;
            const query = 'INSERT INTO discountscategories (id, name) VALUES (DEFAULT, $1) RETURNING *';
            const values = [name];
            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating discount category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Update a discount category
    updateDiscountCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const { name } = req.body;
            const query = 'UPDATE discountscategories SET name = $1 WHERE id = $2 RETURNING *';
            const values = [name, id];
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Category not found' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error updating discount category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Delete a discount category
    deleteDiscountCategory: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM discountscategories WHERE id = $1', [id]);
            res.status(204).send();
        } catch (err) {
            console.error('Error deleting discount category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

module.exports = discountCategoryController;
