import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

type AccessContext = Pick<QueryCtx, "auth" | "db">;
type Role = "superadmin" | "editor" | null;

export const isClerkUserId = (id: string) => /^user_[A-Za-z0-9]{1,100}$/.test(id);
export const superadminId = () => process.env.CMS_SUPERADMIN_USER_ID?.trim() ?? "";

export function findEditor(db: QueryCtx["db"], userId: string) {
  return db.query("cmsEditors").withIndex("by_userId", index => index.eq("userId", userId)).unique();
}

export async function cmsAccess(ctx: AccessContext) {
  const identity = await ctx.auth.getUserIdentity();
  const owner = superadminId();
  let role: Role = null;
  if (identity && isClerkUserId(owner)) {
    if (identity.subject === owner) role = "superadmin";
    else if (await findEditor(ctx.db, identity.subject)) role = "editor";
  }
  return { identity, role };
}

export async function editor(ctx: AccessContext) {
  const { identity, role } = await cmsAccess(ctx);
  if (!identity || !role) throw new ConvexError("This account is not authorized to edit the site.");
  return identity;
}

export async function superadmin(ctx: AccessContext) {
  const { identity, role } = await cmsAccess(ctx);
  if (!identity || role !== "superadmin") {
    throw new ConvexError("Only the super admin can manage editor access.");
  }
  return identity;
}
