const pool = require('./src/config/database');
const { v4: uuidv4 } = require('uuid');

async function test() {
    try {
        const id = uuidv4();
        console.log('Testing insert with string permissions...');
        const query = 'INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3) RETURNING *';
        // sending string as permissions
        await pool.query(query, [id, 'Test Role ' + Date.now(), '<permissions></permissions>']);
        console.log('Success with string!');
    } catch (err) {
        console.error('Error with string:', err.message);

        try {
            const id2 = uuidv4();
            console.log('Testing insert with Buffer permissions...');
            const query2 = 'INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3) RETURNING *';
            const buf = Buffer.from('<permissions></permissions>', 'utf-8');
            await pool.query(query2, [id2, 'Test Role Buf ' + Date.now(), buf]);
            console.log('Success with Buffer!');
        } catch (err2) {
            console.error('Error with Buffer:', err2.message);
        }
    } finally {
        pool.end();
    }
}

test();
