const pool = require('./src/config/database');

const addPdfSetting = async () => {
    try {
        await pool.query(
            "INSERT INTO settings (id, value, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET value = $2, description = $3",
            ['enable_pdf_ticket', 'false', 'Mostrar ticket PDF si falla impresora térmica']
        );
        console.log('Setting enable_pdf_ticket added/updated.');
        process.exit(0);
    } catch (err) {
        console.error('Error adding setting:', err);
        process.exit(1);
    }
};

addPdfSetting();
