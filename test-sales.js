const API_URL = 'http://localhost:3000/api';
let token = '';

async function runTests() {
    try {
        console.log('Iniciando tests...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin' })
        });
        const loginData = await loginRes.json();

        if (loginData.success && loginData.data && loginData.data.token) {
            token = loginData.data.token;
            console.log('Login exitoso!');
        } else {
            console.log('Login fallido:', loginData.message || 'Error desconocido');
            return;
        }

        console.log('Consultando catálogo...');
        const catRes = await fetch(`${API_URL}/sales/catalog`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const catData = await catRes.json();
        console.log('Catálogo:', { cat: catData.categories?.length, prod: catData.products?.length });

        if (catData.products?.length > 0) {
            const product = catData.products[0];

            // Obtener una caja válida
            // (En un test real haríamos un endpoint o lo sabríamos, aquí probamos cash_register_id: 1)

            console.log('Probando creación de venta con producto:', product.name);
            const saleData = {
                person_id: loginData.data.user.id,
                lines: [{
                    product_id: product.id,
                    units: 1,
                    price: product.pricesell,
                    taxid: product.taxcat || 1,
                    tax_rate: 0.16
                }],
                payments: [{ method: 'cash', total: parseFloat(product.pricesell) * 1.16 }],
                total: parseFloat(product.pricesell) * 1.16,
                cash_register_id: 1 // Creado por init script
            };
            const saleRes = await fetch(`${API_URL}/sales`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(saleData)
            });
            const saleResult = await saleRes.json();
            console.log('Resultado Venta:', saleResult);
        } else {
            console.log('No hay productos para vender en el catálogo.');
        }
        console.log('Tests finalizados.');
    } catch (err) {
        console.error('ERROR EN TESTS:', err);
    }
}

runTests();
