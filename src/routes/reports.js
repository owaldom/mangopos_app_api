const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Ventas
router.get('/sales/by-user', reportsController.getSalesByUser);
router.get('/sales/by-product', reportsController.getSalesByProduct);
router.get('/sales/by-tax', reportsController.getSalesByTax);
router.get('/sales/book', reportsController.getSalesBook);
router.get('/sales/utility', reportsController.getSalesUtility);
router.get('/sales/discounts', reportsController.getSalesDiscounts);
router.get('/sales/chart', reportsController.getSalesChartData);
router.get('/sales/invoices-with-foreign-currency', reportsController.getInvoicesWithForeignCurrency);

// Inventario
router.get('/inventory/current', reportsController.getInventoryCurrent);
router.get('/inventory/general', reportsController.getInventoryGeneral);
router.get('/inventory/low-stock', reportsController.getInventoryLowStock);
router.get('/inventory/movements', reportsController.getInventoryMovements);
router.get('/inventory/price-list', reportsController.getInventoryPriceList);
router.get('/inventory/intake', reportsController.getInventoryIntake);

// Compras
router.get('/purchases/by-supplier', reportsController.getPurchasesBySupplier);
router.get('/purchases/book', reportsController.getPurchasesBook);
router.get('/purchases/cxp', reportsController.getPurchasesCXP);

// Caja
router.get('/cash/closed-pos', reportsController.getClosedPOS);
router.get('/cash/closed-pos-detail', reportsController.getClosedPOSDetail);

// Clientes
router.get('/customers/list', reportsController.getCustomersList);
router.get('/customers/statement', reportsController.getCustomerStatement);
router.get('/customers/balance', reportsController.getCustomersBalance);
router.get('/customers/payments', reportsController.getCustomersPayments);
router.get('/customers/diary', reportsController.getCustomersDiary);

// Productos
router.get('/products/list', reportsController.getProductsList);
router.get('/products/catalog', reportsController.getProductsCatalog);

// Otros
router.get('/people/list', reportsController.getPeopleList);

module.exports = router;
