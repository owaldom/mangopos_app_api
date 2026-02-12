const pool = require('./src/config/database');

async function debugCatalog() {
    try {
        const locId = 1;
        console.log('--- Checking Categories ---');
        const allCats = await pool.query('SELECT count(*) FROM categories');
        console.log(`Total categories in DB: ${allCats.rows[0].count}`);

        const visibleCats = await pool.query('SELECT id, name, parentid, visible_in_pos FROM categories WHERE visible_in_pos = true');
        console.log(`Visible categories found: ${visibleCats.rows.length}`);
        if (visibleCats.rows.length > 0) {
            console.log('Sample Visible Category:', visibleCats.rows[0]);
        } else {
            const sampleCat = await pool.query('SELECT id, name, visible_in_pos FROM categories LIMIT 5');
            console.log('Sample categories (first 5):', sampleCat.rows);
        }

        console.log('\n--- Checking Products ---');
        const allProds = await pool.query('SELECT count(*) FROM products WHERE marketable = true');
        console.log(`Total marketable products: ${allProds.rows[0].count}`);

        const catalogProds = await pool.query('SELECT count(*) FROM products_cat');
        console.log(`Products in products_cat: ${catalogProds.rows[0].count}`);

        const productsRes = await pool.query(`
            SELECT p.id, p.name, p.marketable, p.image,
                   CASE WHEN pc.product IS NOT NULL THEN true ELSE false END as incatalog
            FROM products p
            LEFT JOIN products_cat pc ON p.id = pc.product
            WHERE p.marketable = true
            LIMIT 5
        `);

        console.log('Sample Products with incatalog flag:');
        productsRes.rows.forEach(p => {
            console.log(`- ID: ${p.id}, Name: ${p.name}, InCatalog: ${p.incatalog}, HasImage: ${p.image ? 'Yes' : 'No'}`);
            if (p.image) {
                try {
                    console.log(`  Image type: ${typeof p.image}, isBuffer: ${Buffer.isBuffer(p.image)}`);
                    const base64 = p.image.toString('base64');
                    console.log(`  Base64 conversion success (length: ${base64.length})`);
                } catch (e) {
                    console.log(`  Base64 conversion FAILED: ${e.message}`);
                }
            }
        });

    } catch (err) {
        console.error('DEBUG ERROR:', err);
    } finally {
        process.exit();
    }
}

debugCatalog();
