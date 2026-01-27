const pool = require('./src/config/database');


async function seedTaxes() {
    try {
        console.log('Verificando impuestos...');

        // 1. Tax Categories
        const categories = [
            { name: 'Impuesto Estándar' },
            { name: 'Exento' }
        ];

        for (const cat of categories) {
            const exists = await pool.query('SELECT id FROM taxcategories WHERE name = $1', [cat.name]);
            if (exists.rows.length === 0) {
                await pool.query('INSERT INTO taxcategories (name) VALUES ($1)', [cat.name]);
                console.log(`Creada categoría de impuesto: ${cat.name}`);
            }
        }

        // Obtener IDs
        const catStandard = await pool.query('SELECT id FROM taxcategories WHERE name = $1', ['Impuesto Estándar']);
        const catExempt = await pool.query('SELECT id FROM taxcategories WHERE name = $1', ['Exento']);

        if (catStandard.rows.length === 0) return;

        // 2. Taxes
        const taxes = [
            { name: 'IVA 16%', category: catStandard.rows[0].id, rate: 0.16 },
            { name: 'IVA 0%', category: catExempt.rows[0].id, rate: 0.00 },
            { name: 'Exento', category: catExempt.rows[0].id, rate: 0.00 }
        ];

        for (const tax of taxes) {
            const exists = await pool.query('SELECT id FROM taxes WHERE name = $1', [tax.name]);
            if (exists.rows.length === 0) {
                await pool.query(
                    'INSERT INTO taxes (name, category, rate, validfrom) VALUES ($1, $2, $3, NOW())',
                    [tax.name, tax.category, tax.rate]
                );
                console.log(`Creado impuesto: ${tax.name}`);
            }
        }

        console.log('Seeding de impuestos completado.');
        process.exit(0);

    } catch (err) {
        console.error('Error seeding taxes:', err);
        process.exit(1);
    }
}

seedTaxes();
