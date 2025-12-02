import { cukiesDb } from './mongodb-cukies';
import { prisma } from './prisma';
import { createUserDirectly } from './mongodb-hub';

/**
 * Busca un usuario en la BD cukies por wallet address
 * Los wallets pueden estar en formato TRON (T...) o BSC (0x...)
 */
export async function findUserInCukiesDb(walletAddress: string) {
  try {
    // Normalizar address: TRON addresses no son case-sensitive, BSC sí
    const normalizedAddress = walletAddress.startsWith('T') 
      ? walletAddress.toUpperCase() 
      : walletAddress.toLowerCase();
    
    // Primero buscar en la colección de wallets directamente
    const walletsCollection = await cukiesDb.wallets();
    const wallet = await walletsCollection.findOne({
      $or: [
        { address: normalizedAddress },
        { address: walletAddress }, // También buscar sin normalizar
        { address: { $regex: new RegExp(`^${walletAddress}$`, 'i') } }
      ]
    });

    if (!wallet) {
      return null;
    }

    // Si encontramos el wallet, buscar el usuario que lo tiene en su array de wallets
    const usersCollection = await cukiesDb.users();
    const user = await usersCollection.findOne({
      wallets: wallet._id.toString()
    });

    return user;
  } catch (error) {
    console.error('Error buscando usuario en BD cukies:', error);
    return null;
  }
}

/**
 * Sincroniza datos de un usuario de la BD cukies a cukies-hub
 */
export async function syncUserFromCukiesDb(
  walletAddress: string,
  cukiesUser: any
): Promise<any> {
  try {
    // Normalizar address: TRON addresses (T...) se mantienen en mayúsculas, BSC (0x...) en minúsculas
    const normalizedAddress = walletAddress.startsWith('T') 
      ? walletAddress.toUpperCase() 
      : walletAddress.toLowerCase();

    // Verificar si el usuario ya existe en cukies-hub
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    // Preparar datos para sincronizar
    const syncData: any = {
      walletAddress: normalizedAddress,
    };

    // Sincronizar username si existe y no está ya establecido
    if (cukiesUser.username && !existingUser?.isUsernameSet) {
      // Verificar que el username no esté en uso
      const usernameExists = await prisma.user.findUnique({
        where: { username: cukiesUser.username },
      });

      if (!usernameExists) {
        syncData.username = cukiesUser.username;
        syncData.isUsernameSet = true;
      }
    }

    // Sincronizar email si existe
    if (cukiesUser.email && !existingUser?.email) {
      // Verificar que el email no esté en uso
      const emailExists = await prisma.user.findFirst({
        where: {
          email: cukiesUser.email,
          walletAddress: { not: normalizedAddress },
        },
      });

      if (!emailExists) {
        syncData.email = cukiesUser.email;
      }
    }

    // Sincronizar nombre si existe (podemos guardarlo en bio o crear un campo)
    // Por ahora lo guardamos en bio si no hay bio
    if (cukiesUser.name && !existingUser?.bio) {
      const fullName = cukiesUser.lastName
        ? `${cukiesUser.name} ${cukiesUser.lastName}`
        : cukiesUser.name;
      syncData.bio = fullName;
    }

    if (existingUser) {
      // Actualizar usuario existente
      return await prisma.user.update({
        where: { walletAddress: normalizedAddress },
        data: syncData,
        include: {
          lastCheckIn: true,
          completedQuests: {
            include: {
              quest: true,
            },
          },
        },
      });
    } else {
      // Crear nuevo usuario con datos sincronizados usando MongoDB directamente
      // Si no hay username, usar el wallet address (normalizado)
      if (!syncData.username) {
        syncData.username = normalizedAddress;
      }

      // Create user directly in MongoDB to avoid transaction issues
      const newUserId = await createUserDirectly({
        walletAddress: normalizedAddress,
        username: syncData.username,
        email: syncData.email,
        isUsernameSet: syncData.isUsernameSet,
        bio: syncData.bio,
      });

      // Fetch the created user with Prisma to get the full object with relations
      return await prisma.user.findUnique({
        where: { id: newUserId },
        include: {
          lastCheckIn: true,
          completedQuests: {
            include: {
              quest: true,
            },
          },
        },
      });
    }
  } catch (error) {
    console.error('Error sincronizando usuario desde BD cukies:', error);
    throw error;
  }
}

/**
 * Busca y sincroniza un usuario desde la BD cukies si existe
 * Retorna el usuario de cukies-hub (creado o actualizado)
 */
export async function findOrSyncUserFromCukies(walletAddress: string) {
  const cukiesUser = await findUserInCukiesDb(walletAddress);
  
  if (cukiesUser) {
    console.log('✅ Usuario encontrado en BD cukies, sincronizando...');
    return await syncUserFromCukiesDb(walletAddress, cukiesUser);
  }
  
  return null;
}

