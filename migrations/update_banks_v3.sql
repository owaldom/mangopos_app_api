-- Migration: Update Banks Management v3
-- Description: Adds allows_pago_movil to banks table
-- Date: 2026-02-02

ALTER TABLE banks ADD COLUMN IF NOT EXISTS allows_pago_movil BOOLEAN DEFAULT false;
