import { getCukiesDb, cukiesDb, closeCukiesConnection } from '../src/lib/mongodb-cukies.ts';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });
config({ path: join(__dirname, '..', '.env') });

async function testConnection() {
  try {
    console.log('🔍 Probando conexión a la base de datos cukies...\n');
    
    // Test basic connection
    const db = await getCukiesDb();
    console.log('✅ Conexión establecida\n');
    
    // Test users collection
    const usersCollection = await cukiesDb.users();
    const userCount = await usersCollection.countDocuments();
    console.log(`📊 Usuarios encontrados: ${userCount}`);
    
    if (userCount > 0) {
      const sampleUser = await usersCollection.findOne();
      console.log('\n📝 Ejemplo de usuario:');
      console.log(JSON.stringify(sampleUser, null, 2));
    }
    
    // Test cukies collection
    const cukiesCollection = await cukiesDb.cukies();
    const cukiesCount = await cukiesCollection.countDocuments();
    console.log(`\n📊 Cukies encontrados: ${cukiesCount}`);
    
    if (cukiesCount > 0) {
      const sampleCukie = await cukiesCollection.findOne();
      console.log('\n🎮 Ejemplo de Cukie:');
      console.log(JSON.stringify(sampleCukie, null, 2));
      
      // Test query: Get cukies for a specific user
      if (sampleCukie.user) {
        const userCukies = await cukiesCollection.find({ user: sampleCukie.user }).limit(5).toArray();
        console.log(`\n👤 Cukies del usuario ${sampleCukie.user}: ${userCukies.length}`);
      }
    }
    
    // Test wallets collection
    const walletsCollection = await cukiesDb.wallets();
    const walletsCount = await walletsCollection.countDocuments();
    console.log(`\n📊 Wallets encontrados: ${walletsCount}`);
    
    console.log('\n✅ Todas las pruebas completadas exitosamente\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await closeCukiesConnection();
  }
}

testConnection();

