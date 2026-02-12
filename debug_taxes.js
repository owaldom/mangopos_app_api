const pool = require('./src/config/database');

async function debugTaxes() {
    try {
        const result = await pool.query('SELECT id, name, rate FROM taxes');
        console.log('TAXES_JSON:' + JSON.stringify(result.rows));
    } catch (err) {
        console.error('Error querying taxes:', err);
    } finally {
        process.exit();
    }
}

debugTaxes();
