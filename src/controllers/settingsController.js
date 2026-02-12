const pool = require('../config/database');

const settingsController = {
    getAll: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, value, description FROM settings');
            const settings = {};
            result.rows.forEach(row => {
                settings[row.id] = row.value;
            });
            res.json(settings);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener configuración' });
        }
    },

    updateSettings: async (req, res) => {
        const client = await pool.connect();
        try {
            const settings = req.body;
            await client.query('BEGIN');

            for (const [id, value] of Object.entries(settings)) {
                const result = await client.query(
                    'UPDATE settings SET value = $1 WHERE id = $2',
                    [value.toString(), id]
                );

                if (result.rowCount === 0) {
                    await client.query(
                        'INSERT INTO settings (id, value, description) VALUES ($1, $2, $3)',
                        [id, value.toString(), 'Setting ' + id]
                    );
                }
            }

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar configuración' });
        } finally {
            client.release();
        }
    },

    // Actualizar moneda
    updateCurrency: async (req, res) => {
        try {
            const { id } = req.params;
            const { exchange_rate, symbol, name, active } = req.body;

            await pool.query(
                `UPDATE currencies 
                 SET exchange_rate = $1, symbol = $2, name = $3, active = $4, last_updated = NOW()
                 WHERE id = $5`,
                [exchange_rate, symbol, name, active !== undefined ? active : true, id]
            );

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar moneda' });
        }
    }
};

module.exports = settingsController;
