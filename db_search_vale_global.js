const pool = require('./src/config/database');

async function searchAll() {
    try {
        // Query to get all table and column names that are string types
        const tablesQuery = `
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND data_type IN ('character varying', 'text', 'character')
        `;
        const tables = await pool.query(tablesQuery);

        console.log(`Found ${tables.rows.length} columns to search.`);

        for (const row of tables.rows) {
            const { table_name, column_name } = row;
            try {
                // Search for 'vale' case-insensitively
                const matchQuery = `
                    SELECT DISTINCT "${column_name}" as val
                    FROM "${table_name}" 
                    WHERE "${column_name}" ILIKE '%vale%'
                    LIMIT 5
                `;
                const matches = await pool.query(matchQuery);

                if (matches.rows.length > 0) {
                    matches.rows.forEach(m => {
                        console.log(`[MATCH] Table: ${table_name}, Column: ${column_name}, Value: "${m.val}"`);
                    });
                }
            } catch (e) {
                // Ignore errors for specific tables/columns (like those with missing permissions)
            }
        }

        console.log('Search finished.');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

searchAll();
