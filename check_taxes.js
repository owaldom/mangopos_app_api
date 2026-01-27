const pool = require('./src/config/database');
pool.query('SELECT id, name, rate FROM taxes', (err, res) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(res.rows));
    }
    pool.end();
});
