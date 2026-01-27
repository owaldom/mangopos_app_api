const pool = require('./src/config/database');

async function checkSchema() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'gastos_diarios'
            ORDER BY ordinal_position
        `);
        result.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
