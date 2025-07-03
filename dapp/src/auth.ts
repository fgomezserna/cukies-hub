import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import DiscordProvider from "next-auth/providers/discord";
import TwitterProvider from "next-auth/providers/twitter";
import { prisma } from "@/lib/prisma";

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: { scope: "identify guilds" },
      },
    }),
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0", // OAuth 2.0 flow
    }),
  ],
  pages: {
    // Redirect to custom success page with quest/task params
    signIn: '/quests',
  },
  callbacks: {
    async jwt({ token, account }) {
      // Expose provider on token for client checks if needed
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.provider) {
        // @ts-ignore
        session.provider = token.provider;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // For OAuth providers, we want to link to existing wallet user
      if (account?.provider === 'discord' || account?.provider === 'twitter') {
        try {
          // Get the current user ID from the session/context
          // Since we're in OAuth flow, we need to check if there's already a logged in user
          // and link the account to them rather than creating a new user
          
          // Check if account already exists
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            include: { user: true },
          });

          if (existingAccount) {
            // Account already linked, allow sign in
            return true;
          }

          // For now, we'll prevent creating new users via OAuth
          // The linking should happen in the quest verification endpoint
          return false;
        } catch (error) {
          console.error('SignIn callback error:', error);
          return false;
        }
      }

      return true;
    },
  },
  events: {
    async linkAccount({ user, account, profile }) {
      console.log(`Linked ${account.provider} account to user ${user.id}`);
    },
  },
};

export const { handlers: { GET, POST }, auth } = NextAuth(authConfig); 