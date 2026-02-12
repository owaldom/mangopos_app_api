const pool = require('./src/config/database');
console.log('Using config:', {
    host: pool.options.host,
    port: pool.options.port,
    database: pool.options.database,
    user: pool.options.user
});


async function checkLocations() {
    try {
        console.log('--- Table Schema: locations ---');
        const schemaRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'locations'
            ORDER BY ordinal_position
        `);
        schemaRes.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));

        console.log('\n--- Sample Data: locations ---');
        const dataRes = await pool.query('SELECT * FROM locations LIMIT 10');
        console.log(JSON.stringify(dataRes.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkLocations();
