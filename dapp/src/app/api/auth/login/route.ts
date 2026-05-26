import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { findOrSyncUserFromCukies } from '@/lib/user-sync';
import { createUserDirectly } from '@/lib/mongodb-hub';
import { normalizeWalletAddress } from '@/lib/wallet-address';
import {
  clearWalletChallengeCookie,
  readWalletChallenge,
  readWalletSession,
  resolveWalletType,
  setWalletSessionCookie,
  verifyWalletSignature,
  walletSessionMatchesAddress,
} from '@/lib/wallet-auth';
import { ensureHubWalletForLogin } from '@/lib/user-wallets';

const userIncludes = {
  lastCheckIn: true,
  completedQuests: {
    include: {
      quest: true,
    },
  },
} as const;

export async function POST(request: Request) {
  try {
    const { walletAddress, walletType, message, signature } = await request.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const resolvedWalletType = resolveWalletType(normalizedAddress, walletType);

    const existingSession = await readWalletSession();

    if (existingSession && walletSessionMatchesAddress(existingSession, normalizedAddress)) {
      const sessionUser = await prisma.user.findUnique({
        where: { id: existingSession.userId },
        include: userIncludes,
      });

      if (sessionUser) {
        return NextResponse.json(sessionUser);
      }
    }

    if (typeof message !== 'string' || typeof signature !== 'string') {
      return NextResponse.json(
        { error: 'Wallet signature is required', requiresSignature: true },
        { status: 401 },
      );
    }

    const challenge = await readWalletChallenge();

    if (
      !challenge ||
      challenge.walletAddress !== normalizedAddress ||
      challenge.walletType !== resolvedWalletType ||
      challenge.message !== message
    ) {
      return NextResponse.json(
        { error: 'Invalid or expired wallet challenge', requiresSignature: true },
        { status: 401 },
      );
    }

    const isSignatureValid = await verifyWalletSignature({
      walletAddress: normalizedAddress,
      walletType: resolvedWalletType,
      message,
      signature,
    });

    if (!isSignatureValid) {
      return NextResponse.json(
        { error: 'Invalid wallet signature', requiresSignature: true },
        { status: 401 },
      );
    }

    let user = await prisma.user.findUnique({
      where: {
        walletAddress: normalizedAddress,
      },
      include: userIncludes,
    });

    if (!user) {
      try {
        // Primero buscar en la BD cukies y sincronizar si existe
        console.log('🔍 Buscando usuario en BD cukies...');
        const syncedUser = await findOrSyncUserFromCukies(normalizedAddress);
        
        if (syncedUser) {
          console.log('✅ Usuario sincronizado desde BD cukies');
          user = syncedUser;
        } else {
          // Si no existe en cukies, crear nuevo usuario
          console.log('📝 Usuario no encontrado en BD cukies, creando nuevo...');

          // Create user directly in MongoDB to avoid transaction issues
          const newUserId = await createUserDirectly({
            walletAddress: normalizedAddress,
            username: normalizedAddress, // Use the entire wallet address as unique username
          });
          
          // Now fetch the user with the same includes as above to ensure consistent object shape
          user = await prisma.user.findUnique({
            where: {
                id: newUserId,
            },
            include: userIncludes
          });
        }
      } catch (createError) {
              // If the error is P2002 (unique constraint violation), it means the user was already created
      // by another process in the meantime, so we search for it again
        if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
          user = await prisma.user.findUnique({
            where: {
              walletAddress: normalizedAddress,
            },
            include: userIncludes,
          });
          
          if (!user) {
            throw new Error('Usuario no encontrado después de error de constraint único');
          }
        } else {
          // Si es otro tipo de error, lo relanzamos
          throw createError;
        }
      }
    }

    if (!user) {
      throw new Error('Usuario no encontrado despues de login');
    }

    await ensureHubWalletForLogin(user.id, normalizedAddress, resolvedWalletType);
    await setWalletSessionCookie({
      userId: user.id,
      walletAddress: user.walletAddress,
      signedWalletAddress: normalizedAddress,
      walletType: resolvedWalletType,
    });
    await clearWalletChallengeCookie();

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 
