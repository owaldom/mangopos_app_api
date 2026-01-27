const pool = require('./src/config/database');
const bcrypt = require('bcrypt');

async function test() {
    try {
        console.log('Testing insert into PEOPLE without ID...');
        // Need a valid role ID. I created one in previous step, e.g. 2.
        // Or I can query one.
        const roleResult = await pool.query('SELECT id FROM roles LIMIT 1');
        const roleId = roleResult.rows[0].id;

        const hash = await bcrypt.hash('123456', 10);

        const query = `
            INSERT INTO people (name, role, card, apppassword, visible, image)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        // Sending null for image for now.
        const result = await pool.query(query, ['TestUser ' + Date.now(), roleId, 'CARD123', hash, true, null]);

        console.log('Success!', result.rows[0]);
    } catch (err) {
        console.error('Error with people:', err.message);
        if (err.message.includes('NOT NULL')) {
            console.log('Maybe ID is not serial?');
        }
    } finally {
        pool.end();
    }
}

test();
