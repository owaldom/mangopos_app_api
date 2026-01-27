const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mangopos_sunmarket',
    password: 'casa1234',
    port: 5433
});

async function check() {
    try {
        const time = await pool.query("SELECT CURRENT_TIMESTAMP as now");
        console.log('DB Now:', time.rows[0].now);

        const prods = await pool.query("SELECT id, name, discount FROM products WHERE id = 6");
        console.log('--- PRODUCTO ID 6 ---');
        console.table(prods.rows);

        const discs = await pool.query("SELECT * FROM discounts WHERE idcategory = 1");
        console.log('--- DESCUENTOS PARA CATEGORIA 1 ---');
        console.table(discs.rows);

        if (discs.rows.length > 0) {
            console.log('Sample ValidFrom:', discs.rows[0].validfrom);
            console.log('Type of ValidFrom:', typeof discs.rows[0].validfrom);
            console.log('Now <= ValidFrom:', time.rows[0].now <= discs.rows[0].validfrom);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
