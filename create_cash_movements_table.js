require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function createCashMovementsTable() {
    const client = await pool.connect();
    try {
        console.log('Creating cash_movements table...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS cash_movements (
                id SERIAL PRIMARY KEY,
                datenew TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                money VARCHAR,
                movement_type VARCHAR NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
                amount NUMERIC(18,3) NOT NULL,
                currency_id INTEGER,
                concept VARCHAR,
                person VARCHAR,
                FOREIGN KEY (currency_id) REFERENCES currencies(id)
            )
        `);

        console.log('✓ Table cash_movements created successfully');

        // Create index for better query performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_movements_datenew ON cash_movements(datenew DESC);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_movements_money ON cash_movements(money);
        `);

        console.log('✓ Indexes created successfully');

    } catch (err) {
        console.error('Error creating table:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

createCashMovementsTable()
    .then(() => {
        console.log('\nDatabase setup completed!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Setup failed:', err);
        process.exit(1);
    });
