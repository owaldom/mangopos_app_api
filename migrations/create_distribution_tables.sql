-- Migration: Create Distribution Orders Tables
-- Description: Creates tables for managing inventory distribution from factory to POS

-- Table: distribution_orders
CREATE TABLE IF NOT EXISTS distribution_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    dispatch_document_number VARCHAR(50),
    origin_location_id INTEGER NOT NULL REFERENCES locations(id),
    origin_location_name VARCHAR(255) NOT NULL,
    destination_location_name VARCHAR(255) NOT NULL,
    date_created TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_received TIMESTAMP WITHOUT TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'exported', 'received', 'cancelled')),
    notes TEXT,
    received_by VARCHAR(255),
    reception_notes TEXT,
    created_by VARCHAR(255),
    checksum VARCHAR(64)
);

-- Table: distribution_order_lines
CREATE TABLE IF NOT EXISTS distribution_order_lines (
    id SERIAL PRIMARY KEY,
    distribution_order_id INTEGER NOT NULL REFERENCES distribution_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    quantity_sent NUMERIC(10, 3) NOT NULL,
    quantity_received NUMERIC(10, 3),
    unit_cost NUMERIC(10, 2) DEFAULT 0,
    difference_reason TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_distribution_orders_status ON distribution_orders(status);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_date_created ON distribution_orders(date_created);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_origin ON distribution_orders(origin_location_id);
CREATE INDEX IF NOT EXISTS idx_distribution_order_lines_order ON distribution_order_lines(distribution_order_id);
CREATE INDEX IF NOT EXISTS idx_distribution_order_lines_product ON distribution_order_lines(product_id);

-- Comments
COMMENT ON TABLE distribution_orders IS 'Stores distribution orders from factory to POS locations';
COMMENT ON TABLE distribution_order_lines IS 'Stores line items for each distribution order';
COMMENT ON COLUMN distribution_orders.status IS 'pending: created but not exported, exported: JSON file generated, received: confirmed at POS, cancelled: cancelled order';
COMMENT ON COLUMN distribution_orders.checksum IS 'SHA-256 checksum for JSON file integrity validation';
