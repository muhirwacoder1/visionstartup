import type { Auth } from "convex/server";

export async function editor(auth: Auth) {
  const identity = await auth.getUserIdentity();
  const allowed = (process.env.CMS_ADMIN_USER_IDS || "").split(",").map(s => s.trim());
  if (!identity || !allowed.includes(identity.subject)) throw new Error("This account is not authorized to edit the site.");
  return identity;
}
