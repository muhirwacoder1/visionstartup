import { v } from "convex/values";

export const page = v.object({ fields: v.record(v.string(), v.string()), hidden: v.array(v.string()) });
export const menuItem = v.object({ id: v.string(), label: v.string(), href: v.string(), visible: v.boolean() });
export const menu = v.array(menuItem);
export const project = v.object({
  title: v.string(), category: v.string(), year: v.string(), summary: v.string(),
  cover: v.string(), coverAlt: v.string(), featured: v.boolean(),
  sections: v.array(v.object({ title: v.string(), body: v.string(), media: v.string(), alt: v.string() })),
});
export const media = v.object({
  key: v.string(), name: v.string(), mime: v.string(), size: v.number(),
  url: v.string(), cloudinaryId: v.string(), created: v.number(),
});
