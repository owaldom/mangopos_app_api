const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function forceCreateUser() {
    try {
        const username = 'admin';
        const password = 'admin';
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log(`Creando/Actualizando usuario ${username}...`);

        const res = await pool.query(`
            INSERT INTO people (name, apppassword, role, visible)
            VALUES ($1, $2, 1, TRUE)
            ON CONFLICT (name) DO UPDATE SET apppassword = $2
            RETURNING id, name
        `, [username, hashedPassword]);

        console.log('Usuario creado exitosamente:', res.rows[0]);
    } catch (err) {
        console.error('Error creando usuario:', err.message);
    } finally {
        await pool.end();
    }
}

forceCreateUser();
