const pool = require('../config/database');

const discountCustCategoryController = {
    // Get all discount customer categories
    getAllDiscountCustCategories: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM discountscustcategories ORDER BY NAME');
            res.json(result.rows);
        } catch (err) {
            console.error('Error executing query', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Create a new discount customer category
    createDiscountCustCategory: async (req, res) => {
        try {
            const { name } = req.body;
            const query = 'INSERT INTO discountscustcategories (id, name) VALUES (DEFAULT, $1) RETURNING *';
            const values = [name];
            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating discount customer category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Update a discount customer category
    updateDiscountCustCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const { name } = req.body;
            const query = 'UPDATE discountscustcategories SET name = $1 WHERE id = $2 RETURNING *';
            const values = [name, id];
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Customer Category not found' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error updating discount customer category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Delete a discount customer category
    deleteDiscountCustCategory: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM discountscustcategories WHERE id = $1', [id]);
            res.status(204).send();
        } catch (err) {
            console.error('Error deleting discount customer category', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

module.exports = discountCustCategoryController;
