import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { cmsAccess, editor, findEditor, isClerkUserId, superadmin, superadminId } from "./authz";

const maximumEditors = 100;

export const myRole = query({
  args: {},
  returns: v.union(v.literal("superadmin"), v.literal("editor"), v.null()),
  handler: async ctx => (await cmsAccess(ctx)).role,
});

export const requireEditor = internalQuery({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    await editor(ctx);
    return null;
  },
});

export const listEditors = query({
  args: {},
  returns: v.array(v.object({ userId: v.string(), label: v.string() })),
  handler: async ctx => {
    await superadmin(ctx);
    const editors = await ctx.db.query("cmsEditors").order("desc").take(maximumEditors);
    return editors.map(({ userId, label }) => ({ userId, label }));
  },
});

export const grantEditor = mutation({
  args: { userId: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await superadmin(ctx);
    const userId = args.userId.trim();
    const label = args.label.trim();
    if (!isClerkUserId(userId)) throw new ConvexError("Enter the Clerk user ID from the person's CMS sign-in screen.");
    if (label.length > 100) throw new ConvexError("Keep the editor name under 100 characters.");
    if (userId === superadminId()) throw new ConvexError("The super admin already has full access.");

    const current = await findEditor(ctx.db, userId);
    if (current) {
      await ctx.db.patch("cmsEditors", current._id, { label });
      return null;
    }
    if ((await ctx.db.query("cmsEditors").take(maximumEditors)).length >= maximumEditors) {
      throw new ConvexError("Remove an existing editor before adding another.");
    }
    await ctx.db.insert("cmsEditors", { userId, label });
    return null;
  },
});

export const revokeEditor = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await superadmin(ctx);
    if (userId === superadminId()) throw new ConvexError("Super admin access cannot be removed from the CMS.");
    if (!isClerkUserId(userId)) throw new ConvexError("Invalid Clerk user ID.");
    const current = await findEditor(ctx.db, userId);
    if (current) await ctx.db.delete("cmsEditors", current._id);
    return null;
  },
});
