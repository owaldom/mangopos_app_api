const pool = require('./src/config/database');

async function createProductsCatTable() {
    try {
        console.log('Verificando tabla products_cat...');

        // Crear tabla products_cat si no existe
        await pool.query(`
      CREATE TABLE IF NOT EXISTS products_cat (
        product INTEGER NOT NULL,
        catorder INTEGER,
        CONSTRAINT products_cat_fk_1 FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

        // Crear índice
        await pool.query(`
      CREATE INDEX IF NOT EXISTS products_cat_inx_1 ON products_cat(catorder);
    `);

        // Crear índice único para evitar duplicados del mismo producto en catalogo
        // Aunque el esquema original no lo tiene explicito unique, es logico. 
        // Pero seguiremos esquema original: producto FK + catorder.

        console.log('Tabla products_cat verificada/creada.');
        process.exit(0);

    } catch (err) {
        console.error('Error creating products_cat:', err);
        process.exit(1);
    }
}

createProductsCatTable();
