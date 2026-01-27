/**
 * Database Cleaning Script for Sun Market POS
 * 
 * Purpose: 
 *   Removes all transactional history (sales, purchases, payments, etc.)
 *   and resets operational counters (stock levels, customer debt) 
 *   to provide a fresh start for the system.
 * 
 * Safety:
 *   - Runs within a single PostgreSQL transaction.
 *   - Uses TRUNCATE ... RESTART IDENTITY CASCADE to reset serial IDs.
 *   - Requires --force flag for execution.
 * 
 * Usage: node clean_db.js --force
 */

const pool = require('./src/config/database');

// List of transactional tables to empty
const TABLES_TO_TRUNCATE = [
    'abonos',
    'apartados',
    'cash_movements',
    'closedcash',
    'discountlines',
    'discountlinespurchase',
    'gastos',
    'gastos_diarios',
    'log_devolucionsist',
    'log_ventas',
    'payments',
    'payments_account',
    'paymentspurchase',
    'paymentspurchase_account',
    'receipts',
    'receiptspurchase',
    'reservation_customers',
    'reservations',
    'sharedtickets',
    'sharedticketspurchase',
    'stockdiary',
    'taxlines',
    'taxlinespurchase',
    'taxdetaillines',
    'ticketlines',
    'ticketlines_service',
    'ticketlinespurchase',
    'tickets',
    'ticketspurchase',
    'ticketsnum',
    'ticketsnum_abono',
    'ticketsnum_abono_purchase',
    'ticketsnum_payment',
    'ticketsnum_payment_purchase',
    'ticketsnum_purchase',
    'ticketsnum_refund',
    'ticketsnum_refund_purchase',
    'stock177'
];

async function cleanDatabase() {
    const force = process.argv.includes('--force');

    if (!force) {
        console.log('\x1b[33m%s\x1b[0m', '---------------------------------------------------------');
        console.log('\x1b[33m%s\x1b[0m', 'WARNING: This script will WIPE ALL TRANSACTIONAL DATA.');
        console.log('\x1b[33m%s\x1b[0m', 'Sales, purchases, payments and stock history will be lost.');
        console.log('\x1b[33m%s\x1b[0m', 'Catalog (products, categories, etc.) will be PRESERVED.');
        console.log('\x1b[33m%s\x1b[0m', '---------------------------------------------------------');
        console.log('\x1b[36m%s\x1b[0m', 'To execute, run: node clean_db.js --force');
        process.exit(0);
    }

    const client = await pool.connect();

    try {
        console.log('\x1b[32m%s\x1b[0m', 'Starting database cleaning process...');

        // Start Transaction
        await client.query('BEGIN');
        console.log(' - Transaction started.');

        // 1. Truncate transactional tables
        console.log(` - Truncating ${TABLES_TO_TRUNCATE.length} tables...`);
        const truncateQuery = `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`;
        await client.query(truncateQuery);
        console.log('   [OK] Transactional tables cleared.');

        // 2. Reset Customers Debt
        console.log(' - Resetting customer debt and dates...');
        await client.query('UPDATE customers SET curdebt = 0, curdate = NULL');
        console.log('   [OK] Customers debt reset to 0.');

        // 3. Reset Stock Units
        console.log(' - Resetting current stock levels to 0...');
        await client.query('UPDATE stockcurrent SET units = 0');
        console.log('   [OK] Stock levels reset to 0.');

        // 4. Reset Other Counters (optional, if any specific ones exist outside sequences)
        // Add more resets here if needed.

        // Commit Transaction
        await client.query('COMMIT');

        console.log('\x1b[32m%s\x1b[0m', '---------------------------------------------------------');
        console.log('\x1b[32m%s\x1b[0m', 'DATABASE SUCCESSFULLY CLEANED!');
        console.log('\x1b[32m%s\x1b[0m', 'System is ready for a new operational period.');
        console.log('\x1b[32m%s\x1b[0m', '---------------------------------------------------------');

    } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('\x1b[31m%s\x1b[0m', '---------------------------------------------------------');
        console.error('\x1b[31m%s\x1b[0m', 'ERROR: Database cleaning failed. Transaction rolled back.');
        console.error('\x1b[31m%s\x1b[0m', error.message);
        console.error('\x1b[31m%s\x1b[0m', '---------------------------------------------------------');
    } finally {
        client.release();
        process.exit();
    }
}

cleanDatabase();
