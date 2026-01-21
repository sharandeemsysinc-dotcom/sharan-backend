import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";
import EntraId from "@auth/express/providers/microsoft-entra-id";
import Credentials from "@auth/express/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "./prisma";
import { verifyOTP } from "../services/otp.service";

// Validate required environment variables
const requiredEnvVars = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

export const authConfig = {
    adapter: PrismaAdapter(prisma),
    providers: [
        Google({
            clientId: requiredEnvVars.GOOGLE_CLIENT_ID!,
            clientSecret: requiredEnvVars.GOOGLE_CLIENT_SECRET!,
        }),
        EntraId({
            clientId: requiredEnvVars.AZURE_AD_CLIENT_ID!,
            clientSecret: requiredEnvVars.AZURE_AD_CLIENT_SECRET!,
            issuer: `https://login.microsoftonline.com/${requiredEnvVars.AZURE_AD_TENANT_ID}/v2.0`,
        }),
        Credentials({
            name: "OTP",
            credentials: {
                email: { label: "Email", type: "email" },
                code: { label: "OTP Code", type: "text" },
            },
            authorize: async (credentials) => {
                if (!credentials?.email || !credentials?.code) {
                    return null;
                }

                try {
                    const user = await verifyOTP(credentials.email as string, credentials.code as string);
                    if (user) {
                        return {
                            id: user.id,
                            email: user.email,
                            name: user.user_name,
                            role: user.role?.name
                        };
                    }
                    return null;
                } catch (error) {
                    console.error("OTP Verification failed", error);
                    return null;
                }
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, user }: { token: any, user: any }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
            }
            return token;
        },
        async session({ session, token }: { session: any, token: any }) {
            if (session.user) {
                session.user.id = token.id as string;
                (session.user as any).role = token.role;
            }
            return session;
        }
    }
};
