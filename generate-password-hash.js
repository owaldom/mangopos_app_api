/**
 * Script para generar hashes de contraseñas con bcrypt
 * 
 * Uso:
 * 1. npm install bcrypt (si no está instalado)
 * 2. node generate-password-hash.js
 */

const bcrypt = require('bcrypt');

// Configuración
const SALT_ROUNDS = 10; // Mismo valor usado en la API

// Contraseñas a hashear
const passwords = [
    { label: 'admin123', password: 'admin123' },
    { label: 'caja123', password: 'caja123' },
    { label: 'usuario123', password: 'usuario123' }
];

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║      Generador de Contraseñas Hash (Bcrypt)             ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

async function generateHashes() {
    for (const item of passwords) {
        const hash = await bcrypt.hash(item.password, SALT_ROUNDS);
        console.log(`📝 Contraseña: ${item.label}`);
        console.log(`🔐 Hash:       ${hash}`);
        console.log(`\n📋 INSERT SQL:\n`);
        console.log(`INSERT INTO people (name, apppassword, role, visible)`);
        console.log(`VALUES ('usuario', '${hash}', 1, TRUE);\n`);
        console.log('─'.repeat(60) + '\n');
    }

    // Generar contraseña personalizada
    console.log('💡 Para generar una contraseña personalizada, edita este archivo\n');
    console.log('   y agrega tu contraseña al array "passwords".\n');
}

generateHashes().then(() => {
    console.log('✅ Hashes generados exitosamente!\n');
}).catch(err => {
    console.error('❌ Error:', err);
});
