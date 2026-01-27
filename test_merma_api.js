const axios = require('axios');

async function testMovement() {
    const url = 'http://localhost:3000/api/stock/movements';
    const payload = {
        date: new Date(),
        location: 1,
        reason: -3, // Merma
        product: '6',
        units: -5, // Mimicking the signedUnits from frontend
        price: 0.20,
        concept: 'Test Merma'
    };

    try {
        console.log('Sending movement...');
        const res = await axios.post(url, payload);
        console.log('Response:', res.data);
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

testMovement();
