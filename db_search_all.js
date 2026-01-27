const pool = require('./src/config/database');

async function searchAll() {
    try {
        const searchTerm = '%vale%';
        console.log(`Searching for pattern "${searchTerm}" in all tables...`);

        const tablesRes = await pool.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND data_type IN ('character varying', 'text', 'character')
        `);

        for (const row of tablesRes.rows) {
            const { table_name, column_name } = row;
            try {
                const searchRes = await pool.query(`
                    SELECT "${column_name}" 
                    FROM "${table_name}" 
                    WHERE "${column_name}" ILIKE $1 
                    LIMIT 1
                `, [searchTerm]);

                if (searchRes.rows.length > 0) {
                    console.log(`MATCH FOUND: Table [${table_name}], Column [${column_name}]: "${searchRes.rows[0][column_name]}"`);
                }
            } catch (e) {
                // Skip errors (e.g. system tables or protected columns)
            }
        }

        console.log('Search complete.');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

searchAll();
