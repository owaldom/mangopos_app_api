-- Migration: Update Payments Metadata v1
-- Description: Adds account_number and is_pago_movil to payments and paymentspurchase tables
-- Date: 2026-02-02

ALTER TABLE payments ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_pago_movil BOOLEAN DEFAULT false;

ALTER TABLE paymentspurchase ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);
ALTER TABLE paymentspurchase ADD COLUMN IF NOT EXISTS is_pago_movil BOOLEAN DEFAULT false;
