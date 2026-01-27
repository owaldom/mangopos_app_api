const pool = require('./src/config/database');

async function checkTables() {
    try {
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%purchase%'
    `);
        console.log('Purchase Tables Found:');
        res.rows.forEach(row => console.log(`- ${row.table_name}`));

        const res2 = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('receipts', 'tickets', 'ticketlines', 'payments', 'stockdiary', 'stockcurrent', 'thirdparties', 'customers')
    `);
        console.log('\nOther Relevant Tables:');
        res2.rows.forEach(row => console.log(`- ${row.table_name}`));

        process.exit(0);
    } catch (err) {
        console.error('Error checking tables:', err);
        process.exit(1);
    }
}

checkTables();
