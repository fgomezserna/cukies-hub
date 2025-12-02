# Configuración de Bases de Datos

Este proyecto utiliza dos bases de datos MongoDB:

## 1. Base de Datos Principal: `cukies-hub`

**Conexión**: `DATABASE_URL` en `.env.local`

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

## 2. Base de Datos Legacy: `cukies`

**Conexión**: `CUKIES_DATABASE_URL` en `.env.local`

**Propósito**: Base de datos legacy que contiene usuarios y personajes (cukies) existentes.

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
# Base de datos principal (Prisma)
DATABASE_URL="mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin"

# Base de datos legacy (cukies)
CUKIES_DATABASE_URL="mongodb://admin:changeme123@192.168.1.221:27017/cukies?authSource=admin"
```

## Colecciones Disponibles en `cukies`

El helper `cukiesDb` proporciona acceso a las siguientes colecciones:

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

Si necesitas migrar datos de `cukies` a `cukies-hub`, puedes crear scripts de migración que:

1. Leen datos de `cukies` usando `cukiesDb`
2. Transforman los datos al formato esperado por Prisma
3. Escriben los datos en `cukies-hub` usando `prisma`

Ejemplo:

```typescript
import { cukiesDb } from '@/lib/mongodb-cukies';
import { prisma } from '@/lib/prisma';

async function migrateUsers() {
  const usersCollection = await cukiesDb.users();
  const users = await usersCollection.find({}).toArray();
  
  for (const user of users) {
    // Transformar y crear en la nueva BD
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

