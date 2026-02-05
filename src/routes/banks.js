const express = require('express');
const router = express.Router();
const banksController = require('../controllers/banksController');

// ============ BANK CRUD ROUTES ============

// Create a new bank
router.post('/', banksController.createBank);

// Get all banks (with optional active filter)
router.get('/', banksController.getAllBanks);

// Get banks summary (consolidated balances)
router.get('/summary', banksController.getBanksSummary);

// Internal transfer between accounts
router.post('/transfers', banksController.transferFunds);

// Get bank by ID
router.get('/:id', banksController.getBankById);

// Update bank
router.put('/:id', banksController.updateBank);

// Delete bank (soft delete if has transactions)
router.delete('/:id', banksController.deleteBank);

// ============ TRANSACTION ROUTES ============

// Create manual transaction
router.post('/:bank_id/transactions', banksController.createTransaction);

// Get bank transactions (with optional filters)
router.get('/:bank_id/transactions', banksController.getBankTransactions);

// Get current bank balance
router.get('/:bank_id/balance', banksController.getBankBalance);

// Get bank movement report
router.get('/:bank_id/movements', banksController.getBankMovementReport);

// Reconcile bank balance
router.post('/:bank_id/reconcile', banksController.reconcileBalance);

module.exports = router;
