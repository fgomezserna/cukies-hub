import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { processReferralByUsername } from '@/lib/referrals';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const lowercasedAddress = walletAddress.toLowerCase();

    let user = await prisma.user.findUnique({
      where: {
        walletAddress: lowercasedAddress,
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
        // Check for referrer username in cookies
        const cookieStore = await cookies();
        const referrerUsername = cookieStore.get('referrerUsername')?.value;
        
        const newUser = await prisma.user.create({
          data: {
            walletAddress: lowercasedAddress,
            username: lowercasedAddress, // Use the entire wallet address as unique username
          },
        });

        // Process referral if username exists
        if (referrerUsername) {
          try {
            await processReferralByUsername(newUser.id, referrerUsername);
            // Clear the referral cookie after successful processing
            cookieStore.set('referrerUsername', '', { expires: new Date(0) });
          } catch (referralError) {
            console.error('Error processing referral:', referralError);
            // Continue with user creation even if referral fails
          }
        }
        
        // Now fetch the user with the same includes as above to ensure consistent object shape
        user = await prisma.user.findUnique({
          where: {
              id: newUser.id,
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
      } catch (createError) {
              // If the error is P2002 (unique constraint violation), it means the user was already created
      // by another process in the meantime, so we search for it again
        if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
          user = await prisma.user.findUnique({
            where: {
              walletAddress: lowercasedAddress,
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