const pool = require('./src/config/database');

async function check() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'gastos_diarios'");
        console.log("COLUMNS:");
        res.rows.forEach(r => console.log("- " + r.column_name));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
