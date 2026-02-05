const pool = require('./src/config/database');
const fs = require('fs');

const checkSchema = async () => {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'payments'
            ORDER BY ordinal_position
        `);
        let output = 'Columns in payments table:\n';
        res.rows.forEach(row => output += `${row.column_name}: ${row.data_type}\n`);

        const res2 = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'paymentspurchase'
            ORDER BY ordinal_position
        `);
        output += '\nColumns in paymentspurchase table:\n';
        res2.rows.forEach(row => output += `${row.column_name}: ${row.data_type}\n`);

        fs.writeFileSync('schema_output.txt', output);
        console.log('Schema written to schema_output.txt');
        process.exit(0);
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
};

checkSchema();
