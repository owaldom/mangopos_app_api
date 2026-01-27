const pool = require('./src/config/database');

const createSettingsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT
            )
        `);

        // Insert default values if not exists
        const defaults = [
            ['price_decimals', '2', 'Número de decimales para los precios'],
            ['total_decimals', '2', 'Número de decimales para los totales'],
            ['quantity_decimals', '3', 'Número de decimales para las cantidades'],
            ['currency_symbol', 'Bs.', 'Símbolo de la moneda local'],
            ['currency_code', 'VES', 'Código de la moneda local'],
            ['company_name', 'MANGOPOS', 'Nombre de la empresa'],
            ['company_address', 'DIRECCION DE PRUEBA', 'Dirección de la empresa']
        ];

        for (const [id, value, desc] of defaults) {
            await pool.query(
                'INSERT INTO settings (id, value, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
                [id, value, desc]
            );
        }

        console.log('Settings table created and defaults inserted.');
        process.exit(0);
    } catch (err) {
        console.error('Error creating settings table:', err);
        process.exit(1);
    }
};

createSettingsTable();
