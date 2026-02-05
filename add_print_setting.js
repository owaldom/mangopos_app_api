const pool = require('./src/config/database');

async function main() {
    try {
        const checkResult = await pool.query("SELECT * FROM settings WHERE id = 'print_server_url'");

        if (checkResult.rows.length === 0) {
            console.log("Setting 'print_server_url' not found. Inserting default...");
            await pool.query(
                "INSERT INTO settings (id, value, description) VALUES ($1, $2, $3)",
                ['print_server_url', 'http://localhost:3001/api', 'URL del servidor de impresión térmica']
            );
            console.log("✓ Setting 'print_server_url' inserted successfully.");
        } else {
            console.log("- Setting 'print_server_url' already exists.");
        }
    } catch (err) {
        console.error("✗ Error updating database:", err);
    } finally {
        await pool.end();
    }
}

main();
