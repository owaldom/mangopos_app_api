const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433
});

const sql = `
BEGIN;

-- 1. Consolidate into a temporary table
CREATE TEMP TABLE stockcurrent_consolidated AS
SELECT 
    location, 
    product, 
    attributesetinstance_id, 
    SUM(units) as units
FROM stockcurrent
GROUP BY location, product, attributesetinstance_id;

-- 2. Delete all from original table
DELETE FROM stockcurrent;

-- 3. Re-insert consolidated data
INSERT INTO stockcurrent (location, product, attributesetinstance_id, units)
SELECT location, product, attributesetinstance_id, units
FROM stockcurrent_consolidated;

-- 4. Drop the old unique constraint and create the new index with NULLS NOT DISTINCT
ALTER TABLE stockcurrent DROP CONSTRAINT IF EXISTS stockcurrent_location_product_attributesetinstance_id_key;
DROP INDEX IF EXISTS stockcurrent_unique_idx; -- Just in case it partial created
CREATE UNIQUE INDEX stockcurrent_unique_idx 
ON stockcurrent (location, product, attributesetinstance_id) 
NULLS NOT DISTINCT;

COMMIT;
`;

async function run() {
    const client = await pool.connect();
    try {
        console.log('Starting consolidation and index fix...');
        await client.query(sql);
        console.log('Successfully consolidated stock and updated index.');
    } catch (err) {
        console.error('Error during execution:', err);
        console.log('Transaction should have rolled back.');
    } finally {
        client.release();
        await pool.end();
    }
}

run();
