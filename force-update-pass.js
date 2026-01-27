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

async function forceUpdatePassword() {
    try {
        const username = 'admin';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log(`Actualizando contraseña para usuario: ${username}...`);

        const res = await pool.query(`
            UPDATE people 
            SET apppassword = $2
            WHERE name = $1
            RETURNING id, name
        `, [username, hashedPassword]);

        if (res.rows.length > 0) {
            console.log('Contraseña actualizada exitosamente:', res.rows[0]);
        } else {
            console.log('Usuario no encontrado, creándolo...');
            const insertRes = await pool.query(`
                INSERT INTO people (name, apppassword, role, visible)
                VALUES ($1, $2, 1, TRUE)
                RETURNING id, name
            `, [username, hashedPassword]);
            console.log('Usuario creado:', insertRes.rows[0]);
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

forceUpdatePassword();
