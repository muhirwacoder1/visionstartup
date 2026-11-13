import type { AuthConfig } from "convex/server";

// An empty provider list fails closed until the Clerk issuer is configured.
const issuer = Reflect.get(process.env, "CLERK_JWT_ISSUER_DOMAIN");
export default {
  providers: typeof issuer === "string" && /^https:\/\//.test(issuer) ? [{ domain: issuer, applicationID: "convex" }] : [],
} satisfies AuthConfig;
