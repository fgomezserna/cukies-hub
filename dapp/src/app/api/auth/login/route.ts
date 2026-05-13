import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { processReferralByUsername } from '@/lib/referrals';
import { findOrSyncUserFromCukies } from '@/lib/user-sync';
import { createUserDirectly } from '@/lib/mongodb-hub';
import { normalizeWalletAddress } from '@/lib/wallet-address';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(walletAddress);

    let user = await prisma.user.findUnique({
      where: {
        walletAddress: normalizedAddress,
      },
      include: {
        lastCheckIn: true,
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
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
          
          // Check for referrer username in cookies
          const cookieStore = await cookies();
          const referrerUsername = cookieStore.get('referrerUsername')?.value;
          console.log('🔍 Checking for referrer cookie:', referrerUsername);
          
          // Create user directly in MongoDB to avoid transaction issues
          const newUserId = await createUserDirectly({
            walletAddress: normalizedAddress,
            username: normalizedAddress, // Use the entire wallet address as unique username
          });

          // Process referral if username exists
          if (referrerUsername) {
            try {
              console.log('🎯 Processing referral for:', referrerUsername);
              const result = await processReferralByUsername(newUserId, referrerUsername);
              console.log('✅ Referral processed successfully:', result);
              // Clear the referral cookie after successful processing
              cookieStore.set('referrerUsername', '', { expires: new Date(0) });
            } catch (referralError) {
              console.error('❌ Error processing referral:', referralError);
              // Continue with user creation even if referral fails
            }
          } else {
            console.log('❌ No referrer username found in cookies');
          }
          
          // Now fetch the user with the same includes as above to ensure consistent object shape
          user = await prisma.user.findUnique({
            where: {
                id: newUserId,
            },
            include: {
                lastCheckIn: true,
                completedQuests: {
                    include: {
                        quest: true
                    }
                }
            }
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
            include: {
              lastCheckIn: true,
              completedQuests: {
                include: {
                  quest: true,
                },
              },
            },
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

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 
