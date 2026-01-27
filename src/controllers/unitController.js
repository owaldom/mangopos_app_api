const pool = require('../config/database');

const unitController = {
    getAllUnits: async (req, res) => {
        try {
            console.log('Requesting all units...');
            const result = await pool.query('SELECT CODE, NAME FROM UNIDADES WHERE ACTIVO = true ORDER BY NAME');
            console.log('Units found:', result.rows);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching units:', err);
            res.status(500).json({ error: 'Error al obtener unidades' });
        }
    }
};

module.exports = unitController;
