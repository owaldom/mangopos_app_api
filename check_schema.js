const pool = require('./src/config/database');
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'taxes'", (err, res) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(res.rows));
    }
    pool.end();
});
