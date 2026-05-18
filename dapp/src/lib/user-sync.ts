import { cukiesDb } from './mongodb-cukies';
import { prisma } from './prisma';
import { createUserDirectly } from './mongodb-hub';
import { normalizeWalletAddress } from './wallet-address';
import {
  findHubUserIdByLegacyWallets,
  syncHubWalletsFromLegacyUser,
} from './user-wallets';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Busca un usuario en la BD cukies por wallet address
 * Los wallets pueden estar en formato TRON (T...) o BSC (0x...)
 */
export async function findUserInCukiesDb(walletAddress: string) {
  try {
    // Normalizar address: TRON addresses no son case-sensitive, BSC sí
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    
    // Primero buscar en la colección de wallets directamente
    const walletsCollection = await cukiesDb.wallets();
    const wallet = await walletsCollection.findOne({
      $or: [
        { address: normalizedAddress },
        { address: walletAddress }, // También buscar sin normalizar
        { address: { $regex: new RegExp(`^${escapeRegex(walletAddress)}$`, 'i') } }
      ]
    });

    if (!wallet) {
      return null;
    }

    // Si encontramos el wallet, buscar el usuario que lo tiene en su array de wallets
    const usersCollection = await cukiesDb.users();
    const user = await usersCollection.findOne({
      $or: [
        { wallets: wallet._id },
        { wallets: wallet._id.toString() },
      ],
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
    const normalizedAddress = normalizeWalletAddress(walletAddress);

    const legacyUserId = cukiesUser?._id ? String(cukiesUser._id) : null;

    // Verificar si el usuario ya existe en cukies-hub por la wallet actual.
    let existingUser = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    // Si ya se importo otra wallet del mismo usuario legacy, reutilizamos ese usuario.
    if (!existingUser) {
      const linkedUserId = await findHubUserIdByLegacyWallets({
        legacyUserId,
        walletAddresses: [normalizedAddress],
      });

      if (linkedUserId) {
        existingUser = await prisma.user.findUnique({
          where: { id: linkedUserId },
        });
      }
    }

    // Compatibilidad con usuarios sincronizados antes de crear UserWallet.
    if (!existingUser && cukiesUser.username) {
      existingUser = await prisma.user.findUnique({
        where: { username: cukiesUser.username },
      });
    }

    if (!existingUser && cukiesUser.email) {
      existingUser = await prisma.user.findFirst({
        where: { email: cukiesUser.email },
      });
    }

    // Preparar datos para sincronizar
    const syncData: any = {
      ...(existingUser ? {} : { walletAddress: normalizedAddress }),
    };

    // Sincronizar username si existe y no está ya establecido
    if (cukiesUser.username && !existingUser?.isUsernameSet) {
      // Verificar que el username no esté en uso
      const usernameExists = await prisma.user.findUnique({
        where: { username: cukiesUser.username },
      });

      if (!usernameExists || usernameExists.id === existingUser?.id) {
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
          ...(existingUser
            ? { NOT: { id: existingUser.id } }
            : { walletAddress: { not: normalizedAddress } }),
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
      const updatedUser =
        Object.keys(syncData).length > 0
          ? await prisma.user.update({
              where: { id: existingUser.id },
              data: syncData,
              include: {
                lastCheckIn: true,
                completedQuests: {
                  include: {
                    quest: true,
                  },
                },
              },
            })
          : await prisma.user.findUnique({
              where: { id: existingUser.id },
              include: {
                lastCheckIn: true,
                completedQuests: {
                  include: {
                    quest: true,
                  },
                },
              },
            });

      if (!updatedUser) {
        throw new Error('Usuario legacy enlazado no encontrado en cukies-hub');
      }

      await syncHubWalletsFromLegacyUser(updatedUser.id, cukiesUser, normalizedAddress);

      return updatedUser;
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
      const createdUser = await prisma.user.findUnique({
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

      if (createdUser) {
        await syncHubWalletsFromLegacyUser(createdUser.id, cukiesUser, normalizedAddress);
      }

      return createdUser;
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
