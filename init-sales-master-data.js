const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function initSalesData() {
    try {
        console.log('Verificando datos maestros para ventas...');

        // 1. Location
        const locRes = await pool.query('SELECT count(*) FROM locations');
        if (locRes.rows[0].count === '0') {
            console.log('Creando Ubicación...');
            await pool.query('INSERT INTO locations (name) VALUES (\'Principal\')');
        }

        // 2. Cash Register
        const crRes = await pool.query('SELECT count(*) FROM cash_registers');
        if (crRes.rows[0].count === '0') {
            console.log('Creando Caja...');
            const locId = (await pool.query('SELECT id FROM locations LIMIT 1')).rows[0].id;
            await pool.query('INSERT INTO cash_registers (code, name, location_id, active) VALUES ($1, $2, $3, true)', ['CAJA01', 'Caja Principal', locId]);
        }

        // 3. Ticketsnum
        const tnRes = await pool.query('SELECT count(*) FROM ticketsnum');
        if (tnRes.rows[0].count === '0') {
            console.log('Iniciando Contador de Tickets...');
            await pool.query('INSERT INTO ticketsnum (id) VALUES (1)');
        }

        // 4. Taxes (al menos un impuesto base si no hay)
        const taxRes = await pool.query('SELECT count(*) FROM taxes');
        if (taxRes.rows[0].count === '0') {
            console.log('Creando Impuesto Base...');
            const taxCatId = (await pool.query('INSERT INTO taxcategories (name) VALUES (\'General\') RETURNING id')).rows[0].id;
            await pool.query('INSERT INTO taxes (name, category, rate) VALUES ($1, $2, $3)', ['Exento', taxCatId, 0]);
        }

        console.log('Datos maestros verificados/inicializados.');
    } catch (err) {
        console.error('Error init:', err.message);
    } finally {
        await pool.end();
    }
}

initSalesData();
