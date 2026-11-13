import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { editor } from "./authz";
import { media } from "./validators";

export const list = query({
  args: {}, returns: v.array(media),
  handler: async ctx => {
    await editor(ctx.auth);
    return (await ctx.db.query("assets").order("desc").take(100)).map(({_id, _creationTime, ...a}) => a);
  },
});

export const start = internalMutation({
  args: { key: v.string(), owner: v.string(), name: v.string(), mime: v.string(), size: v.number(), expires: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pending = await ctx.db.query("uploads").withIndex("by_owner", q => q.eq("owner", args.owner).gt("expires", Date.now())).take(12);
    if (pending.length >= 12) throw new Error("Too many recent uploads. Try again in a few minutes.");
    await ctx.db.insert("uploads", {...args, claimed: false});
    await ctx.scheduler.runAfter(Math.max(1000, args.expires - Date.now() + 1000), cleanupRef, { key: args.key });
    return null;
  },
});

import { makeFunctionReference } from "convex/server";
const cleanupRef = makeFunctionReference<"action", { key: string }>("storage:cleanup");

export const claim = internalMutation({
  args: { key: v.string(), owner: v.string() },
  returns: v.object({ name: v.string(), mime: v.string(), size: v.number() }),
  handler: async (ctx, { key, owner }) => {
    const row = await ctx.db.query("uploads").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!row || row.owner !== owner || row.expires < Date.now() || row.claimed) throw new Error("This upload is unavailable or expired. Choose the file again.");
    await ctx.db.patch("uploads", row._id, { claimed: true });
    return { name: row.name, mime: row.mime, size: row.size };
  },
});

export const complete = internalMutation({
  args: { asset: media }, returns: v.null(),
  handler: async (ctx, { asset }) => {
    await ctx.db.insert("assets", asset);
    return null;
  },
});

export const forget = internalMutation({
  args: { key: v.string() }, returns: v.null(),
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("uploads").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row) await ctx.db.delete("uploads", row._id);
    return null;
  },
});

export const originalKey = query({
  args: { key: v.string() }, returns: v.union(v.null(), v.string()),
  handler: async (ctx, { key }) => {
    await editor(ctx.auth);
    const asset = await ctx.db.query("assets").withIndex("by_key", q => q.eq("key", key)).unique();
    return asset?.key ?? null;
  },
});
