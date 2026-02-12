const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load database config
const dbConfigPath = path.join(__dirname, 'src/config/database.js');
const dbConfig = require(dbConfigPath);

// Create a new client instance
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433,
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to database');

        // 1. Check receipts columns
        console.log('--- Receipts Columns ---');
        const receiptsCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'receipts';
        `);
        console.log(receiptsCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

        // 2. Check content of taxlines specifically for 'igtf'
        console.log('\n--- Taxlines with IGTF ---');
        const taxlinesRes = await client.query(`
            SELECT tl.*, t.name as tax_name 
            FROM taxlines tl
            JOIN taxes t ON tl.taxid = t.id
            WHERE t.name ILIKE '%igtf%'
            LIMIT 5;
        `);
        console.log(JSON.stringify(taxlinesRes.rows, null, 2));

        // 3. Test the report query logic (simplified)
        console.log('\n--- Report Query Test ---');
        const reportQuery = `
            SELECT 
                r.id, t.ticketid, r.datenew,
                r.currency_id,
                
                (SELECT tl2.amount 
                 FROM taxlines tl2
                 JOIN taxes tx2 ON tl2.taxid = tx2.id
                 WHERE tl2.receipt = r.id AND tx2.name ILIKE '%igtf%'
                 LIMIT 1) as igtf_amount_taxline

            FROM receipts r
            JOIN tickets t ON r.id = t.id
            WHERE r.datenew > NOW() - INTERVAL '7 days'
            LIMIT 10;
        `;
        const reportRes = await client.query(reportQuery);
        console.log(JSON.stringify(reportRes.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
