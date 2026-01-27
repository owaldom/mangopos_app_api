const pool = require('./src/config/database');

async function test() {
    try {
        console.log('Testing insert without ID (expecting SERIAL)...');
        const query = 'INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *';
        // Check permissions type too. Sending Buffer just in case, or string.
        // Let's try string first as legacy default.
        const result = await pool.query(query, ['Test Role Serial ' + Date.now(), '<permissions></permissions>']);
        console.log('Success!', result.rows[0]);
    } catch (err) {
        console.error('Error without ID:', err.message);

        // If it fails with "null value in column id violates not-null constraint", it lacks default value.
        // Then we might need to find Max ID + 1?
    } finally {
        pool.end();
    }
}

test();
