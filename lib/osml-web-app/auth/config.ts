import { AuthOptions, Session } from "next-auth";
import { JWT } from "next-auth/jwt";

export const authOptions: AuthOptions = {
  providers: [
    {
      id: "oidc",
      name: "OIDC Provider",
      type: "oauth",
      wellKnown: `${process.env.NEXT_PUBLIC_OIDC_AUTHORITY}/.well-known/openid-configuration`,
      clientId: process.env.NEXTAUTH_CLIENT_ID,
      authorization: {
        params: { scope: "openid profile email offline_access" }
      },
      idToken: true,
      checks: ["pkce", "state"],
      client: {
        token_endpoint_auth_method: "none" // public client
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email
        };
      }
    }
  ],
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  callbacks: {
    async signIn({ user }) {
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    }
  },
  events: {
    async signIn(message) {
      console.log("SignIn Event:", message);
    },
    async signOut(message) {
      console.log("SignOut Event:", message);
    }
  },
  logger: {
    error(code, metadata) {
      console.error("Auth Error:", { code, metadata });
    },
    warn(code) {
      console.warn("Auth Warning:", code);
    },
    debug(code, metadata) {
      console.log("Auth Debug:", { code, metadata });
    }
  }
};
