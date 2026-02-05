const pool = require('./src/config/database');

async function fixSettings() {
    try {
        console.log('Verificando configuración pos_layout...');
        const res = await pool.query("SELECT * FROM settings WHERE id = 'pos_layout'");

        if (res.rows.length === 0) {
            console.log("Insertando clave 'pos_layout' faltante...");
            await pool.query(
                "INSERT INTO settings (id, value, description) VALUES ($1, $2, $3)",
                ['pos_layout', 'classic', 'Diseño de la pantalla de ventas (classic / modern)']
            );
            console.log('Clave insertada con éxito.');
        } else {
            console.log("La clave 'pos_layout' ya existe.");
        }
    } catch (err) {
        console.error('Error al actualizar configuración:', err);
    } finally {
        await pool.end();
    }
}

fixSettings();
