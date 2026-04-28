import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleClientId =
  process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
export const hasGoogleProvider = Boolean(googleClientId && googleClientSecret);
const isProduction = process.env.NODE_ENV === "production";
const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (isProduction ? undefined : "foldder-dev-auth-secret");
const trustHost = isProduction
  ? process.env.AUTH_TRUST_HOST === "true" || process.env.VERCEL === "1"
  : true;

if (isProduction && !authSecret) {
  throw new Error(
    "Missing AUTH_SECRET (or NEXTAUTH_SECRET) in production. OAuth cannot run safely without it."
  );
}

export const { handlers, auth } = NextAuth({
  debug: !isProduction,
  secret: authSecret,
  trustHost,
  providers: hasGoogleProvider
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  logger: {
    error(code, ...message) {
      console.error("[auth][error]", code, ...message);
    },
    warn(code, ...message) {
      console.warn("[auth][warn]", code, ...message);
    },
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub ?? undefined;
      }
      return session;
    },
  },
});
