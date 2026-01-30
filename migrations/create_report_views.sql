-- Create Views for Reports
-- vw_BookSales: Used for Sales Book Report
-- vw_BookPurchases: Used for Purchase Book Report

-- DROP VIEWS if they exist to allow type changes
DROP VIEW IF EXISTS vw_BookSales;
DROP VIEW IF EXISTS vw_BookPurchases;

CREATE OR REPLACE VIEW vw_BookSales AS
SELECT 
    r.datenew AS DATEINVOICE,
    c.taxid AS RIF,
    c.name AS RAZONSOCIAL,
    CAST(t.ticketid AS VARCHAR) AS NUMEROFACTURA,
    CAST(t.ticketid AS VARCHAR) AS NUMEROCONTROL,
    COALESCE(SUM(tl.units * tl.price * (1 + tx.rate)), 0) AS TOTALVENTASCONIVA,
    COALESCE(SUM(CASE WHEN tx.rate = 0 THEN tl.units * tl.price ELSE 0 END), 0) AS TOTALVENTASNOGRAVADAS,
    COALESCE(SUM(CASE WHEN tx.rate > 0 THEN tl.units * tl.price ELSE 0 END), 0) AS BASEIMPONIBLE,
    MAX(tx.rate) AS ALICUOTA,
    COALESCE(SUM(tl.units * tl.price * tx.rate), 0) AS IMPUESTOIVA
FROM tickets t
JOIN receipts r ON t.id = r.id
JOIN customers c ON t.customer = c.id
JOIN ticketlines tl ON t.id = tl.ticket
JOIN taxes tx ON tl.taxid = tx.id
WHERE t.tickettype = 0 -- Sales only
GROUP BY r.datenew, c.taxid, c.name, t.ticketid;

CREATE OR REPLACE VIEW vw_BookPurchases AS
SELECT 
    t.dateinvoice AS DATEINVOICE,
    r.datenew AS DATEINVOICEF,
    tp.cif AS RIF,
    tp.name AS RAZONSOCIAL,
    tp.typesupplier AS TIPOPROVEEDOR,
    '' AS NROCOMPRETIVA,
    '' AS NRONOTACREDITO,
    '' AS NROFACTURAAFECTADA,
    t.numberinvoice AS NUMEROFACTURA,
    t.numbercontrol AS NUMEROCONTROL,
    '01-REG' AS TIPOTRANSACCION,
    COALESCE(SUM(tl.units * tl.price), 0) AS TOTALCOMPRASCONIVA, -- Simplification
    COALESCE(SUM(CASE WHEN tl.taxid IS NULL OR tx.rate = 0 THEN tl.units * tl.price ELSE 0 END), 0) AS COMPRASEXENTAS,
    COALESCE(SUM(CASE WHEN tx.rate > 0 THEN tl.units * tl.price ELSE 0 END), 0) AS BASEIMPONIBLE,
    MAX(tx.rate) AS ALICUOTA,
    COALESCE(SUM(tl.units * tl.price * tx.rate), 0) AS IMPUESTOIVA,
    0 AS IVARETENIDO
FROM ticketspurchase t
JOIN receiptspurchase r ON t.id = r.id
JOIN thirdparties tp ON t.supplier = tp.id
LEFT JOIN ticketlinespurchase tl ON t.id = tl.ticket
LEFT JOIN taxes tx ON tl.taxid = tx.id
GROUP BY t.dateinvoice, r.datenew, tp.cif, tp.name, tp.typesupplier, t.numberinvoice, t.numbercontrol;
