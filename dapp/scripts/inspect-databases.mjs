import { MongoClient } from 'mongodb';

const CUKIES_HUB_URL = 'mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin';
const CUKIES_URL = 'mongodb://admin:changeme123@192.168.1.221:27017/cukies?authSource=admin';

async function inspectDatabase(url, dbName) {
  const client = new MongoClient(url);
  
  try {
    await client.connect();
    console.log(`\n✅ Conectado a ${dbName}\n`);
    
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    
    console.log(`📊 Colecciones en ${dbName}:`);
    console.log('='.repeat(50));
    
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      const sample = await db.collection(collection.name).findOne();
      
      console.log(`\n📁 ${collection.name} (${count} documentos)`);
      
      if (sample) {
        console.log('   Estructura de ejemplo:');
        const keys = Object.keys(sample);
        keys.forEach(key => {
          const value = sample[key];
          const type = Array.isArray(value) ? 'Array' : typeof value;
          const preview = typeof value === 'object' && value !== null 
            ? (Array.isArray(value) ? `[${value.length} items]` : '{...}')
            : String(value).substring(0, 50);
          console.log(`     - ${key}: ${type} ${preview.length > 0 ? `(${preview})` : ''}`);
        });
      }
    }
    
  } catch (error) {
    console.error(`❌ Error inspeccionando ${dbName}:`, error.message);
  } finally {
    await client.close();
  }
}

async function main() {
  console.log('🔍 Inspeccionando estructuras de bases de datos...\n');
  
  await inspectDatabase(CUKIES_HUB_URL, 'cukies-hub');
  await inspectDatabase(CUKIES_URL, 'cukies');
  
  console.log('\n✅ Inspección completada\n');
}

main().catch(console.error);

