const pool = require('./src/config/database');
const tables = ['discountlinespurchase', 'taxlinespurchase', 'discountdetaillines', 'taxdetaillines'];

async function check() {
    try {
        for (const t of tables) {
            const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${t}' 
        ORDER BY ordinal_position
      `);
            console.log(`\nTable: ${t}`);
            res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
        }
        process.exit(0);
    } catch (err) {
        console.error('Error checking columns:', err);
        process.exit(1);
    }
}

check();
