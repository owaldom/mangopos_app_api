const pool = require('./src/config/database');
async function run() {
    try {
        const res = await pool.query("SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'closedcash' AND (column_name = 'id' OR column_name = 'hostsequence')");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
