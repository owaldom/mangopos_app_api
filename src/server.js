const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const taxRoutes = require('./routes/taxes');
const productRoutes = require('./routes/products');
const stockRoutes = require('./routes/stock');
const despieceRoutes = require('./routes/despiece');
const unitRoutes = require('./routes/units');
const discountRoutes = require('./routes/discounts');
const discountCategoryRoutes = require('./routes/discountCategories');
const discountCustCategoryRoutes = require('./routes/discountCustCategories');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tax-categories', require('./routes/taxCategory'));
app.use('/api/taxes', taxRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', require('./routes/sales'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/cash', require('./routes/cash'));
app.use('/api/customers', require('./routes/customer'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/users', require('./routes/users'));
app.use('/api/despiece', despieceRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/discount-categories', discountCategoryRoutes);
app.use('/api/discount-cust-categories', discountCustCategoryRoutes);
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/purchases', require('./routes/purchase'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/daily-expenses', require('./routes/dailyExpenses'));
app.use('/api/compound-products', require('./routes/compoundsProductsRoutes'));
app.use('/api/product-kits', require('./routes/productKitsRoutes'));
app.use('/api/print', require('./routes/print'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/bank-entities', require('./routes/bankEntities'));
app.use('/api/bank-account-types', require('./routes/bankAccountTypes'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/distribution-orders', require('./routes/distributionOrders'));


// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'MangoPOS API is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║         🥭 MangoPOS API Server 🥭             ║
║                                               ║
║  Server:  http://localhost:${PORT}             ║
║  Status:  ✓ Running                           ║
║  DB:      PostgreSQL (${process.env.DB_NAME})   ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
