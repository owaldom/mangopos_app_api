-- Migration: Update Banks Management v2
-- Description: Adds tables for bank entities and account types, and updates banks table
-- Date: 2026-02-02

-- ============================================
-- 1. Create bank_entities table
-- ============================================
CREATE TABLE IF NOT EXISTS bank_entities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    logo VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for active entities
CREATE INDEX IF NOT EXISTS idx_bank_entities_active ON bank_entities(active);

-- Insert default entities
INSERT INTO bank_entities (name, code) VALUES 
('Banco de Venezuela', '0102'),
('Banesco', '0134'),
('Banco Mercantil', '0105'),
('BBVA Provincial', '0108'),
('Banco Bicentenario', '0175'),
('Banco del Tesoro', '0163'),
('Bancaribe', '0114'),
('Banco Exterior', '0115'),
('Banco Nacional de Crédito (BNC)', '0191'),
('Banco Plaza', '0138'),
('Mi Banco', '0169'),
('Banco Sofitasa', '0137'),
('Banco Activo', '0171'),
('Bancrecer', '0168'),
('Banco Caroni', '0128'),
('Banco Fondo Común', '0151'),
('Bangente', '0146'),
('Banplus', '0174'),
('Banco Venezolano de Crédito', '0104'),
('Otro', '0000')
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. Create bank_account_types table
-- ============================================
CREATE TABLE IF NOT EXISTS bank_account_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default types
INSERT INTO bank_account_types (name) VALUES 
('Corriente'),
('Ahorro'),
('Custodia (USD)'),
('Caja Chica'),
('Crédito'),
('Inversión')
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. Update banks table
-- ============================================

-- Add new relationship columns
ALTER TABLE banks ADD COLUMN IF NOT EXISTS bank_entity_id INTEGER REFERENCES bank_entities(id);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS account_type_id INTEGER REFERENCES bank_account_types(id);

-- Migration logic for existing data (Optional/Manual)
-- This tries to map existing 'bank_entity' string and 'account_type' string to the new IDs
DO $$
BEGIN
    -- Map bank_entities (simple match by name)
    UPDATE banks b
    SET bank_entity_id = be.id
    FROM bank_entities be
    WHERE b.bank_entity = be.name AND b.bank_entity_id IS NULL;

    -- Map account_types (simple match by name)
    UPDATE banks b
    SET account_type_id = bat.id
    FROM bank_account_types bat
    WHERE b.account_type = UPPER(bat.name) AND b.account_type_id IS NULL;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_banks_entity_id ON banks(bank_entity_id);
CREATE INDEX IF NOT EXISTS idx_banks_type_id ON banks(account_type_id);
