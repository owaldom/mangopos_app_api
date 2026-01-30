const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const banksController = {
    // ============ BANK CRUD OPERATIONS ============

    // Create a new bank account
    createBank: async (req, res) => {
        try {
            const {
                name,
                account_number,
                account_type,
                currency,
                initial_balance,
                bank_entity,
                notes
            } = req.body;

            // Validation
            if (!name) {
                return res.status(400).json({ error: 'El nombre del banco es requerido' });
            }

            const id = uuidv4();
            const current_balance = initial_balance || 0;

            const query = `
                INSERT INTO banks (
                    id, name, account_number, account_type, currency, 
                    initial_balance, current_balance, bank_entity, notes, active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
                RETURNING *
            `;

            const values = [
                id,
                name,
                account_number || null,
                account_type || 'CORRIENTE',
                currency || 'VES',
                initial_balance || 0,
                current_balance,
                bank_entity || null,
                notes || null
            ];

            const result = await pool.query(query, values);

            // If initial balance > 0, create an initial transaction
            if (initial_balance && initial_balance > 0) {
                await pool.query(`
                    INSERT INTO bank_transactions (
                        bank_id, transaction_date, transaction_type, amount, 
                        balance_after, reference_type, description
                    )
                    VALUES ($1, CURRENT_TIMESTAMP, 'ADJUSTMENT', $2, $3, 'INITIAL', 'Saldo inicial')
                `, [id, initial_balance, current_balance]);
            }

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error in createBank:', err);
            res.status(500).json({ error: 'Error al crear banco: ' + err.message });
        }
    },

    // Get all banks
    getAllBanks: async (req, res) => {
        try {
            const { active } = req.query;

            let query = 'SELECT * FROM banks';
            const params = [];

            if (active !== undefined) {
                query += ' WHERE active = $1';
                params.push(active === 'true');
            }

            query += ' ORDER BY name ASC';

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getAllBanks:', err);
            res.status(500).json({ error: 'Error al obtener bancos: ' + err.message });
        }
    },

    // Get bank by ID
    getBankById: async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query('SELECT * FROM banks WHERE id = $1', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error in getBankById:', err);
            res.status(500).json({ error: 'Error al obtener banco: ' + err.message });
        }
    },

    // Update bank
    updateBank: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                account_number,
                account_type,
                currency,
                bank_entity,
                notes,
                active
            } = req.body;

            const query = `
                UPDATE banks
                SET name = $1,
                    account_number = $2,
                    account_type = $3,
                    currency = $4,
                    bank_entity = $5,
                    notes = $6,
                    active = $7
                WHERE id = $8
                RETURNING *
            `;

            const values = [
                name,
                account_number,
                account_type,
                currency,
                bank_entity,
                notes,
                active !== undefined ? active : true,
                id
            ];

            const result = await pool.query(query, values);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error in updateBank:', err);
            res.status(500).json({ error: 'Error al actualizar banco: ' + err.message });
        }
    },

    // Delete bank (soft delete)
    deleteBank: async (req, res) => {
        try {
            const { id } = req.params;

            // Check if bank has transactions
            const transactionsCheck = await pool.query(
                'SELECT COUNT(*) as count FROM bank_transactions WHERE bank_id = $1',
                [id]
            );

            if (parseInt(transactionsCheck.rows[0].count) > 0) {
                // Soft delete - just deactivate
                const result = await pool.query(
                    'UPDATE banks SET active = false WHERE id = $1 RETURNING *',
                    [id]
                );
                return res.json({
                    message: 'Banco desactivado (tiene transacciones asociadas)',
                    bank: result.rows[0]
                });
            }

            // Hard delete if no transactions
            await pool.query('DELETE FROM banks WHERE id = $1', [id]);
            res.json({ message: 'Banco eliminado exitosamente' });
        } catch (err) {
            console.error('Error in deleteBank:', err);
            res.status(500).json({ error: 'Error al eliminar banco: ' + err.message });
        }
    },

    // ============ TRANSACTION OPERATIONS ============

    // Create manual transaction
    createTransaction: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { bank_id } = req.params;
            const {
                transaction_type,
                amount,
                payment_method,
                description,
                notes,
                reference_type,
                reference_id
            } = req.body;

            // Validation
            if (!transaction_type || !amount || amount <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Tipo de transacción y monto son requeridos' });
            }

            // Get current balance
            const bankResult = await client.query('SELECT current_balance FROM banks WHERE id = $1', [bank_id]);
            if (bankResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            const currentBalance = parseFloat(bankResult.rows[0].current_balance);
            const transactionAmount = parseFloat(amount);

            // Calculate new balance
            let newBalance;
            if (transaction_type === 'INCOME') {
                newBalance = currentBalance + transactionAmount;
            } else if (transaction_type === 'EXPENSE') {
                newBalance = currentBalance - transactionAmount;
            } else {
                newBalance = currentBalance; // For TRANSFER or ADJUSTMENT, handle separately
            }

            // Insert transaction
            const transactionQuery = `
                INSERT INTO bank_transactions (
                    bank_id, transaction_type, amount, balance_after,
                    payment_method, description, notes, reference_type, reference_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const transactionValues = [
                bank_id,
                transaction_type,
                transactionAmount,
                newBalance,
                payment_method || null,
                description || null,
                notes || null,
                reference_type || 'MANUAL',
                reference_id || null
            ];

            const transactionResult = await client.query(transactionQuery, transactionValues);

            // Update bank balance
            await client.query(
                'UPDATE banks SET current_balance = $1 WHERE id = $2',
                [newBalance, bank_id]
            );

            await client.query('COMMIT');
            res.status(201).json(transactionResult.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error in createTransaction:', err);
            res.status(500).json({ error: 'Error al crear transacción: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Get bank transactions
    getBankTransactions: async (req, res) => {
        try {
            const { bank_id } = req.params;
            const { startDate, endDate, transaction_type } = req.query;

            let query = 'SELECT * FROM bank_transactions WHERE bank_id = $1';
            const params = [bank_id];
            let paramCount = 1;

            if (startDate && endDate) {
                paramCount++;
                query += ` AND transaction_date BETWEEN $${paramCount}`;
                params.push(startDate);
                paramCount++;
                query += ` AND $${paramCount}`;
                params.push(endDate);
            }

            if (transaction_type) {
                paramCount++;
                query += ` AND transaction_type = $${paramCount}`;
                params.push(transaction_type);
            }

            query += ' ORDER BY transaction_date DESC, id DESC';

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error('Error in getBankTransactions:', err);
            res.status(500).json({ error: 'Error al obtener transacciones: ' + err.message });
        }
    },

    // Get bank balance
    getBankBalance: async (req, res) => {
        try {
            const { bank_id } = req.params;

            const result = await pool.query(
                'SELECT current_balance, currency FROM banks WHERE id = $1',
                [bank_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error in getBankBalance:', err);
            res.status(500).json({ error: 'Error al obtener saldo: ' + err.message });
        }
    },

    // Reconcile balance (manual adjustment)
    reconcileBalance: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { bank_id } = req.params;
            const { new_balance, notes } = req.body;

            if (new_balance === undefined || new_balance === null) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Nuevo saldo es requerido' });
            }

            // Get current balance
            const bankResult = await client.query('SELECT current_balance FROM banks WHERE id = $1', [bank_id]);
            if (bankResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            const currentBalance = parseFloat(bankResult.rows[0].current_balance);
            const newBalanceValue = parseFloat(new_balance);
            const difference = newBalanceValue - currentBalance;

            if (difference !== 0) {
                // Create adjustment transaction
                const transactionType = difference > 0 ? 'INCOME' : 'EXPENSE';
                const amount = Math.abs(difference);

                await client.query(`
                    INSERT INTO bank_transactions (
                        bank_id, transaction_type, amount, balance_after,
                        reference_type, description, notes
                    )
                    VALUES ($1, $2, $3, $4, 'ADJUSTMENT', 'Conciliación bancaria', $5)
                `, [bank_id, transactionType, amount, newBalanceValue, notes || null]);

                // Update bank balance
                await client.query(
                    'UPDATE banks SET current_balance = $1 WHERE id = $2',
                    [newBalanceValue, bank_id]
                );
            }

            await client.query('COMMIT');
            res.json({
                message: 'Conciliación exitosa',
                previous_balance: currentBalance,
                new_balance: newBalanceValue,
                adjustment: difference
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error in reconcileBalance:', err);
            res.status(500).json({ error: 'Error al conciliar saldo: ' + err.message });
        } finally {
            client.release();
        }
    },

    // Get bank movement report
    getBankMovementReport: async (req, res) => {
        try {
            const { bank_id } = req.params;
            const { startDate, endDate } = req.query;

            const query = `
                SELECT 
                    b.name as bank_name,
                    b.account_number,
                    b.currency,
                    (SELECT current_balance FROM banks WHERE id = $1) as current_balance,
                    SUM(CASE WHEN bt.transaction_type = 'INCOME' THEN bt.amount ELSE 0 END) as total_income,
                    SUM(CASE WHEN bt.transaction_type = 'EXPENSE' THEN bt.amount ELSE 0 END) as total_expense,
                    COUNT(*) as transaction_count
                FROM banks b
                LEFT JOIN bank_transactions bt ON b.id = bt.bank_id
                WHERE b.id = $1
                  AND ($2::timestamp IS NULL OR bt.transaction_date >= $2)
                  AND ($3::timestamp IS NULL OR bt.transaction_date <= $3)
                GROUP BY b.id, b.name, b.account_number, b.currency
            `;

            const result = await pool.query(query, [bank_id, startDate || null, endDate || null]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Banco no encontrado' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error in getBankMovementReport:', err);
            res.status(500).json({ error: 'Error al generar reporte: ' + err.message });
        }
    }
};

module.exports = banksController;
