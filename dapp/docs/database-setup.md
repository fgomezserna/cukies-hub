# Configuración de Bases de Datos

El runtime de staging y producción usa una única base lógica MongoDB por
entorno. Los nombres históricos de variables se conservan solo como aliases de
compatibilidad: `DATABASE_URL` y `CUKIES_DATABASE_URL` deben llevar la misma URI,
identidad de usuario, `authSource` y base (`cukieshub-new-staging` en staging;
`cukieshub-new` en producción). No se deben crear dos BDs para separar Hub y
legacy.

## Colecciones Hub y legacy en la misma base

**Conexión**: `DATABASE_URL` en `.env.local` (URI canónica del entorno)

**Propósito**: Base de datos principal del proyecto gestionada con Prisma.

**Contiene**:
- Usuarios del sistema (con wallet addresses, social links, XP, etc.)
- Sesiones de juego
- Quests y tareas
- Transacciones de puntos
- Chat rooms y mensajes
- Configuración de juegos

**Acceso**: A través de Prisma Client (`src/lib/prisma.ts`)

```typescript
import { prisma } from '@/lib/prisma';

// Ejemplo: Obtener un usuario
const user = await prisma.user.findUnique({
  where: { walletAddress: '0x...' }
});
```

El código legacy usa `CUKIES_DATABASE_URL`, que debe ser un alias de la misma
conexión. Las colecciones legacy se mantienen con nombres o namespaces
explícitos durante la reconciliación; no se sobrescriben colecciones indexadas
sin una regla de identidad.

### Colecciones legacy

**Propósito**: colecciones legacy que contienen usuarios y personajes (cukies)
existentes dentro de la base canónica.

**Contiene**:
- **users**: Usuarios con name, lastName, username, email, wallets, password, role
- **cukies**: Personajes/cukies con user, origin, network, parents, img, type, cukiNumber, skills, history, children, state, price
- **wallets**: Direcciones de wallet asociadas
- **points** y **tx_points**: Sistema de puntos
- **referrals**: Sistema de referidos
- **tx_nfts**, **txMarketplace**, **txLottery**: Transacciones NFT
- Y más colecciones relacionadas con el ecosistema Cukies

**Acceso**: A través del cliente MongoDB (`src/lib/mongodb-cukies.ts`)

```typescript
import { cukiesDb } from '@/lib/mongodb-cukies';

// Ejemplo: Obtener usuarios
const usersCollection = await cukiesDb.users();
const users = await usersCollection.find({}).limit(10).toArray();

// Ejemplo: Obtener cukies de un usuario
const cukiesCollection = await cukiesDb.cukies();
const userCukies = await cukiesCollection.find({ 
  user: userId 
}).toArray();
```

## Configuración del .env.local

Crea un archivo `.env.local` en la raíz de `dapp/` con:

```env
# Desarrollo local: sustituye los placeholders por credenciales locales.
# En staging/prod Coolify inyecta la URI; no la guardes en el repositorio.
DATABASE_URL="mongodb://<runtime-user>:<runtime-password>@<mongo-host>:<port>/cukieshub-new?authSource=admin"
CUKIES_DATABASE_URL="mongodb://<runtime-user>:<runtime-password>@<mongo-host>:<port>/cukieshub-new?authSource=admin"
```

## Colecciones legacy disponibles en la BD canónica

El helper `cukiesDb` proporciona acceso a las siguientes colecciones legacy (o a
su namespace reconciliado) dentro de la BD canónica:

- `users()` - Usuarios del sistema legacy
- `cukies()` - Personajes/cukies
- `wallets()` - Direcciones de wallet
- `points()` - Puntos de usuarios
- `txPoints()` - Transacciones de puntos
- `referrals()` - Sistema de referidos
- `txNfts()` - Transacciones NFT
- `txMarketplace()` - Transacciones del marketplace
- `txLottery()` - Transacciones de lotería
- `originals()` - NFTs originales
- `processedEvents()` - Eventos procesados de blockchain
- `completedEvents()` - Eventos completados
- `settings()` - Configuración del sistema
- `config()` - Configuración general

## Ejemplo de Uso

```typescript
import { cukiesDb } from '@/lib/mongodb-cukies';

// Obtener todos los cukies de un usuario
async function getUserCukies(userId: string) {
  const cukiesCollection = await cukiesDb.cukies();
  return await cukiesCollection.find({ user: userId }).toArray();
}

// Obtener un usuario por email
async function getUserByEmail(email: string) {
  const usersCollection = await cukiesDb.users();
  return await usersCollection.findOne({ email });
}

// Obtener puntos de un usuario
async function getUserPoints(walletAddress: string) {
  const pointsCollection = await cukiesDb.points();
  const points = await pointsCollection
    .find({ address: walletAddress })
    .sort({ date: -1 })
    .toArray();
  
  const total = points.reduce((sum, p) => sum + (p.points || 0), 0);
  return { total, transactions: points };
}
```

## Migración de Datos

La migración entre las fuentes históricas no se hace con un script ad-hoc ni
creando otra BD. Sigue el runbook de unificación, que exige snapshot,
reconciliación idempotente, namespaces para legacy, reconstrucción de índices y
smoke autenticado antes del corte:
[`infrastructure/ci/production-data-unification.md`](../../infrastructure/ci/production-data-unification.md).

Los ejemplos de lectura/escritura siguientes son válidos para una misma base
canónica una vez completada esa reconciliación:

Ejemplo:

```typescript
import { cukiesDb } from '@/lib/mongodb-cukies';
import { prisma } from '@/lib/prisma';

async function migrateUsers() {
  const usersCollection = await cukiesDb.users();
  const users = await usersCollection.find({}).toArray();
  
  for (const user of users) {
    // Transformar y crear en la colección canónica tras reconciliar identidad.
    await prisma.user.create({
      data: {
        walletAddress: user.wallets[0]?.address || '',
        email: user.email,
        // ... otros campos
      }
    });
  }
}
```
