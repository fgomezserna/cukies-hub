import { MongoClient } from 'mongodb';

function requireDatabaseConfig(envName) {
  const url = process.env[envName]?.trim();
  if (!url) throw new Error(`${envName} es obligatoria.`);

  const match = url.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  if (!match || !match[1]) {
    throw new Error(`${envName} debe incluir explicitamente el nombre de la base de datos.`);
  }

  const dbName = decodeURIComponent(match[1]);
  if (dbName.length > 64 || /[\s/\\."$*<>:|?\u0000]/.test(dbName)) {
    throw new Error(`${envName} contiene un nombre de base de datos invalido.`);
  }

  return { url, dbName };
}

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
          console.log(`     - ${key}: ${type}`);
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

  const hub = requireDatabaseConfig('DATABASE_URL');
  const legacy = requireDatabaseConfig('CUKIES_DATABASE_URL');

  await inspectDatabase(hub.url, hub.dbName);
  await inspectDatabase(legacy.url, legacy.dbName);
  
  console.log('\n✅ Inspección completada\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
