try {
    console.log('Intentando cargar server.js...');
    const app = require('./src/server.js');
    console.log('Carga exitosa. El error no es de sintaxis inmediata.');
} catch (e) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('ERROR FATAL AL INICIAR SERVIDOR:');
    console.error(e.message);
    console.error(e.stack);
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    process.exit(1);
}
