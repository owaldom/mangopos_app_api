const pool = require('../config/database');
const crypto = require('crypto');

const dailyExpenseController = {
    // Obtener todos los gastos diarios
    getAll: async (req, res) => {
        try {
            const {
                search,
                startDate,
                endDate,
                idgastos,
                payment,
                page = 1,
                limit = 20
            } = req.query;
            const offset = (page - 1) * limit;


            let query = 'FROM gastos_diarios gd JOIN gastos g ON gd.idgastos = g.id WHERE 1=1';
            let params = [];
            let paramIdx = 1;

            if (search) {
                query += ` AND (g.name ILIKE $${paramIdx} OR gd.notes ILIKE $${paramIdx})`;
                params.push(`%${search}%`);
                paramIdx++;
            }

            if (startDate) {
                query += ` AND gd.date >= $${paramIdx}`;
                params.push(startDate);
                paramIdx++;
            }

            if (endDate) {
                query += ` AND gd.date <= $${paramIdx}`;
                params.push(endDate);
                paramIdx++;
            }

            if (idgastos) {
                query += ` AND gd.idgastos = $${paramIdx}`;
                params.push(idgastos);
                paramIdx++;
            }

            if (payment) {
                query += ` AND gd.payment = $${paramIdx}`;
                params.push(payment);
                paramIdx++;
            }

            // Count total
            const countResult = await pool.query(`SELECT COUNT(*) ${query}`, params);
            const total = parseInt(countResult.rows[0].count);

            // Fetch data
            const dataResult = await pool.query(
                `SELECT gd.*, g.name as expense_name, g.frequency
                ${query} 
                ORDER BY gd.date DESC, gd.id DESC
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
            res.status(500).json({ error: 'Error al obtener gastos diarios' });
        }
    },

    // Obtener gasto diario por ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(
                `SELECT gd.*, g.name as expense_name, g.frequency, g.taxcat
                FROM gastos_diarios gd
                JOIN gastos g ON gd.idgastos = g.id
                WHERE gd.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Gasto diario no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener gasto diario' });
        }
    },

    // Crear nuevo gasto diario
    create: async (req, res) => {
        try {
            const {
                idgastos,
                date,
                taxbase,
                tax,
                total,
                notes,
                payment,
                numberinvoice
            } = req.body;

            if (!idgastos || !date || taxbase === undefined || total === undefined || !numberinvoice) {
                return res.status(400).json({
                    error: 'Tipo de gasto, fecha, base imponible, total y número de factura son requeridos'
                });
            }

            // Verify expense type exists and is active
            const expenseCheck = await pool.query(
                'SELECT id, visible FROM gastos WHERE id = $1',
                [idgastos]
            );

            if (expenseCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Tipo de gasto no encontrado' });
            }

            if (!expenseCheck.rows[0].visible) {
                return res.status(400).json({ error: 'Tipo de gasto no está activo' });
            }

            const result = await pool.query(
                `INSERT INTO gastos_diarios 
                 (idgastos, date, taxbase, tax, total, notes, payment, numberinvoice) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 RETURNING *`,
                [
                    idgastos,
                    date,
                    taxbase,
                    tax || 0,
                    total,
                    notes || null,
                    payment || 'cash',
                    numberinvoice || null
                ]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al crear gasto diario' });
        }
    },

    // Actualizar gasto diario
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                idgasto,
                date,
                taxbase,
                tax,
                total,
                notes,
                payment,
                numberinvoice
            } = req.body;

            const result = await pool.query(
                `UPDATE gastos_diarios 
                 SET idgastos = $1, date = $2, taxbase = $3, tax = $4, 
                     total = $5, notes = $6, payment = $7, numberinvoice = $8
                 WHERE id = $9 
                 RETURNING *`,
                [idgastos, date, taxbase, tax, total, notes, payment, numberinvoice, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Gasto diario no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al actualizar gasto diario' });
        }
    },

    // Eliminar gasto diario
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query(
                'DELETE FROM gastos_diarios WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Gasto diario no encontrado' });
            }

            res.json({ message: 'Gasto diario eliminado exitosamente' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al eliminar gasto diario' });
        }
    },

    // Obtener totales por período
    getTotalsByPeriod: async (req, res) => {
        try {
            const { startDate, endDate, groupBy = 'day' } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Fechas de inicio y fin son requeridas' });
            }

            let dateFormat;
            switch (groupBy) {
                case 'month':
                    dateFormat = 'YYYY-MM';
                    break;
                case 'year':
                    dateFormat = 'YYYY';
                    break;
                default:
                    dateFormat = 'YYYY-MM-DD';
            }

            const result = await pool.query(
                `SELECT 
                    TO_CHAR(gd.date, $1) as period,
                    g.name as expense_name,
                    COUNT(*) as count,
                    SUM(gd.taxbase) as total_taxbase,
                    SUM(gd.tax) as total_tax,
                    SUM(gd.total) as total_amount
                FROM gastos_diarios gd
                JOIN gastos g ON gd.idgastos = g.id
                WHERE gd.date >= $2 AND gd.date <= $3
                GROUP BY TO_CHAR(gd.date, $1), g.name
                ORDER BY period DESC, g.name`,
                [dateFormat, startDate, endDate]
            );

            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener totales por período' });
        }
    }
};

module.exports = dailyExpenseController;
