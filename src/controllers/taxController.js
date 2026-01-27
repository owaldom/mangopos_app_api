const pool = require('../config/database');

const taxController = {
    // Obtener todos los impuestos
    getAllTaxes: async (req, res) => {
        try {
            const query = `
                SELECT t.*, 
                       tc.name as category_name, 
                       tcc.name as custcategory_name,
                       tp.name as parent_name
                FROM taxes t
                LEFT JOIN taxcategories tc ON t.category = tc.id
                LEFT JOIN taxcustcategories tcc ON t.custcategory = tcc.id
                LEFT JOIN taxes tp ON t.parentid = tp.id
                ORDER BY t.name
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener impuestos' });
        }
    },

    // Obtener un impuesto por ID
    getTaxById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM taxes WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Impuesto no encontrado' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener el impuesto' });
        }
    },

    // Crear impuesto
    createTax: async (req, res) => {
        try {
            const {
                name, validfrom, category, custcategory, parentid, rate, ratecascade, rateorder
            } = req.body;

            // Validar nombre único
            const nameExists = await pool.query('SELECT id FROM taxes WHERE name = $1', [name]);
            if (nameExists.rows.length > 0) {
                return res.status(400).json({ error: 'El nombre del impuesto ya existe' });
            }

            const query = `
                INSERT INTO taxes (
                    name, validfrom, category, custcategory, parentid, rate, ratecascade, rateorder
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `;

            const values = [
                name,
                validfrom || new Date(),
                category,
                custcategory || null,
                parentid || null,
                rate || 0,
                ratecascade || false,
                rateorder || null
            ];

            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear impuesto: ' + err.message });
        }
    },

    // Actualizar impuesto
    updateTax: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name, validfrom, category, custcategory, parentid, rate, ratecascade, rateorder
            } = req.body;

            // Validar existencia
            const exists = await pool.query('SELECT id FROM taxes WHERE id = $1', [id]);
            if (exists.rows.length === 0) {
                return res.status(404).json({ error: 'Impuesto no encontrado' });
            }

            // Validar nombre único (excluyendo el actual)
            const nameExists = await pool.query('SELECT id FROM taxes WHERE name = $1 AND id != $2', [name, id]);
            if (nameExists.rows.length > 0) {
                return res.status(400).json({ error: 'El nombre del impuesto ya existe' });
            }

            const query = `
                UPDATE taxes SET
                    name = $1, validfrom = $2, category = $3, custcategory = $4, 
                    parentid = $5, rate = $6, ratecascade = $7, rateorder = $8
                WHERE id = $9
                RETURNING *
            `;

            const values = [
                name,
                validfrom,
                category,
                custcategory || null,
                parentid || null,
                rate,
                ratecascade,
                rateorder || null,
                id
            ];

            const result = await pool.query(query, values);
            res.json(result.rows[0]);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar impuesto: ' + err.message });
        }
    },

    // Eliminar impuesto
    deleteTax: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('DELETE FROM taxes WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Impuesto no encontrado' });
            }

            res.json({ message: 'Impuesto eliminado correctamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar impuesto (posiblemente esté en uso)' });
        }
    },

    // Obtener Categorías de Impuesto
    getTaxCategories: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM taxcategories ORDER BY name');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener categorías de impuestos' });
        }
    },

    // Obtener Categorías de Impuesto de Cliente
    getTaxCustCategories: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM taxcustcategories ORDER BY name');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener categorías de impuestos de clientes' });
        }
    }
};

module.exports = taxController;
