import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleClientId =
  process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
export const hasGoogleProvider = Boolean(googleClientId && googleClientSecret);
const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  process.env.OPENAI_API_KEY ||
  (process.env.NODE_ENV !== "production" ? "foldder-dev-auth-secret" : undefined);

export const { handlers, auth } = NextAuth({
  secret: authSecret,
  trustHost: true,
  providers: hasGoogleProvider
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub ?? undefined;
      }
      return session;
    },
  },
});
