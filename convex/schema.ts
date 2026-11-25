import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { page, menu, project, media } from "./validators";

export default defineSchema({
  cmsEditors: defineTable({ userId: v.string(), label: v.string() }).index("by_userId", ["userId"]),
  pages: defineTable({ route: v.string(), draft: page, live: v.union(page, v.null()), revision: v.number() }).index("by_route", ["route"]),
  settings: defineTable({ key: v.literal("menu"), draft: menu, live: v.union(menu, v.null()), revision: v.number() }).index("by_key", ["key"]),
  projects: defineTable({ slug: v.string(), draft: project, live: v.union(project, v.null()), revision: v.number(), publishedAt: v.number() })
    .index("by_slug", ["slug"]).index("by_published", ["publishedAt"]),
  assets: defineTable({ ...media.fields }).index("by_key", ["key"]),
  uploads: defineTable({
    key: v.string(), owner: v.string(), mime: v.string(), name: v.string(), size: v.number(), expires: v.number(), claimed: v.boolean(),
  }).index("by_key", ["key"]).index("by_owner", ["owner", "expires"]),
});
