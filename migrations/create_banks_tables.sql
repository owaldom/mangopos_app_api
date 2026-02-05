-- Migration: Create Banks Management Tables
-- Description: Creates tables for bank account management and transaction tracking
-- Date: 2026-01-27

-- ============================================
-- 1. Create banks table (Bank Accounts Master)
-- ============================================
CREATE TABLE IF NOT EXISTS banks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    account_number VARCHAR(100),
    account_type VARCHAR(50) CHECK (account_type IN ('CORRIENTE', 'AHORRO', 'CREDITO')),
    currency VARCHAR(3) DEFAULT 'VES' CHECK (currency IN ('VES', 'USD')),
    initial_balance DECIMAL(15,4) DEFAULT 0,
    current_balance DECIMAL(15,4) DEFAULT 0,
    bank_entity VARCHAR(255),
    notes TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for active banks lookup
CREATE INDEX IF NOT EXISTS idx_banks_active ON banks(active);
CREATE INDEX IF NOT EXISTS idx_banks_entity ON banks(bank_entity);

-- ============================================
-- 2. Create bank_transactions table
-- ============================================
CREATE TABLE IF NOT EXISTS bank_transactions (
    id SERIAL PRIMARY KEY,
    bank_id VARCHAR(255) NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT')),
    amount DECIMAL(15,4) NOT NULL CHECK (amount > 0),
    balance_after DECIMAL(15,4) NOT NULL,
    reference_type VARCHAR(50),
    reference_id VARCHAR(255),
    payment_method VARCHAR(50),
    description TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES people(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank ON bank_transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_type ON bank_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reference ON bank_transactions(reference_type, reference_id);

-- ============================================
-- 3. Add bank_id to existing payments tables
-- ============================================

-- Add bank_id to payments table (sales)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_id VARCHAR(255) REFERENCES banks(id);
CREATE INDEX IF NOT EXISTS idx_payments_bank ON payments(bank_id);

-- Add bank_id to paymentspurchase table (purchases)
ALTER TABLE paymentspurchase ADD COLUMN IF NOT EXISTS bank_id VARCHAR(255) REFERENCES banks(id);
CREATE INDEX IF NOT EXISTS idx_paymentspurchase_bank ON paymentspurchase(bank_id);

-- ============================================
-- 4. Create trigger to update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_banks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_banks_updated_at
    BEFORE UPDATE ON banks
    FOR EACH ROW
    EXECUTE FUNCTION update_banks_updated_at();

-- ============================================
-- 5. Insert sample data (optional)
-- ============================================
-- Uncomment to insert sample banks for testing
/*
INSERT INTO banks (id, name, account_number, account_type, currency, initial_balance, current_balance, bank_entity, active)
VALUES 
    ('BANK001', 'Cuenta Corriente Principal', '0102-0123-45-6789012345', 'CORRIENTE', 'VES', 0, 0, 'Banco de Venezuela', true),
    ('BANK002', 'Cuenta Ahorro USD', '0134-0987-65-4321098765', 'AHORRO', 'USD', 0, 0, 'Banesco', true),
    ('BANK003', 'Cuenta Mercantil', '0105-0555-55-5555555555', 'CORRIENTE', 'VES', 0, 0, 'Banco Mercantil', true);
*/

-- ============================================
-- Rollback Script (if needed)
-- ============================================
/*
DROP TRIGGER IF EXISTS trigger_banks_updated_at ON banks;
DROP FUNCTION IF EXISTS update_banks_updated_at();
DROP INDEX IF EXISTS idx_paymentspurchase_bank;
DROP INDEX IF EXISTS idx_payments_bank;
ALTER TABLE paymentspurchase DROP COLUMN IF EXISTS bank_id;
ALTER TABLE payments DROP COLUMN IF EXISTS bank_id;
DROP INDEX IF EXISTS idx_bank_transactions_reference;
DROP INDEX IF EXISTS idx_bank_transactions_type;
DROP INDEX IF EXISTS idx_bank_transactions_date;
DROP INDEX IF EXISTS idx_bank_transactions_bank;
DROP TABLE IF EXISTS bank_transactions;
DROP INDEX IF EXISTS idx_banks_entity;
DROP INDEX IF EXISTS idx_banks_active;
DROP TABLE IF EXISTS banks;
*/
