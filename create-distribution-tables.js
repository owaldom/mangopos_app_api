const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

const createDistributionTables = async () => {
    try {
        const sqlPath = path.join(__dirname, 'migrations', 'create_distribution_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        await pool.query(sql);
        
        console.log('✓ Distribution tables created successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error creating distribution tables:', err);
        process.exit(1);
    }
};

createDistributionTables();
