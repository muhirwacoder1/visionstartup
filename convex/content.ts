import { ConvexError, v, type Infer } from "convex/values";
import { query, mutation } from "./_generated/server";
import { editor } from "./authz";
import { page, menu, project } from "./validators";
import manifest from "./fields.json";

const fail = (message: string): never => { throw new ConvexError(message); };
const slugOK = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64;
const checkRevision = (actual: number, expected: number) => {
  if (actual !== expected) fail("Someone saved a newer version. Reload the editor before saving.");
};
const linkOK = (s: string) => !s || !/[\u0000-\u001f\u007f]/.test(s) && ( (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) || /^#[\w-]*$/.test(s) || /^(https:\/\/|mailto:|tel:)/i.test(s));
const mediaOK = (s: string) => !s || /^\/assets\/[\w.%/-]+$/.test(s) && !s.includes("..") ||
  /^https:\/\/res\.cloudinary\.com\/[\w-]+\/(image|video)\/upload\//.test(s) ||
  /^https:\/\/player\.vimeo\.com\/video\/\d+(?:\?|$)/.test(s);
const imageOK = (s: string) => !s || (/^\/assets\/.+\.(png|jpe?g|gif|webp|avif|svg)$/i.test(s) || s.includes("/image/upload/")) && mediaOK(s);
const cleanPage = (route: string, value: Infer<typeof page>) => {
  const entry = manifest[route as keyof typeof manifest];
  if (!entry) return fail("Unknown page.");
  if (Object.keys(value.fields).length > 800 || JSON.stringify(value).length > 60000) fail("Too much content for one page.");
  const types: Record<string,string> = entry.fields;
  for (const [key, val] of Object.entries(value.fields)) {
    const type = Object.hasOwn(types, key) ? types[key] : null;
    if (!type || val.length > (type === "text" ? 15000 : 2048)) fail("One of the page fields is invalid.");
    if (type === "toggle" && val !== "true" && val !== "false" || type === "link" && !linkOK(val) || type === "media" && !mediaOK(val) ||
      type === "image" && !imageOK(val)) fail("Use an approved link or media URL.");
  }
  if (value.hidden.length > 80 || value.hidden.some(id => !(entry.sections as string[]).includes(id))) fail("Unknown section.");
  return value;
};
const cleanMenu = (items: Infer<typeof menu>) => {
  if (items.length > 10 || new Set(items.map(item => item.id)).size !== items.length ||
    items.some(i => !slugOK(i.id) || !i.label.trim() || i.label.length > 34 || !i.href || i.href.length > 300 || !linkOK(i.href))) fail("Check the menu labels and links.");
  return items;
};
const cleanProject = (value: Infer<typeof project>, publishing: boolean) => {
  if (!value.title.trim() || value.title.length > 100 || value.category.length > 80 || value.year.length > 15 ||
    value.summary.length > 2400 || value.coverAlt.length > 280 || !imageOK(value.cover) ||
    value.sections.length > 20 || value.sections.some(s => s.title.length > 120 || s.body.length > 12000 ||
    s.alt.length > 280 || !mediaOK(s.media) || s.media.includes("player.vimeo.com")) ||
    JSON.stringify(value).length > 24000) fail("Check the project fields and media.");
  if (publishing && (!value.cover || !value.coverAlt.trim() || !value.summary.trim() ||
    value.sections.some(s => s.media && !s.media.includes("/video/upload/") && !s.alt.trim()))) fail("Add a cover image, image descriptions, and a summary before publishing.");
  return value;
};

export const access = query({ args: {}, returns: v.boolean(), handler: async ctx => {
  try { await editor(ctx.auth); return true; } catch { return false; }
}});
export const publicPage = query({
  args: { route: v.string(), slug: v.optional(v.string()) },
  returns: v.object({ page: v.union(v.null(), page), menu: v.union(v.null(), menu), projects: v.array(v.object({ slug: v.string(), content: project })) }),
  handler: async (ctx, { route, slug }) => {
    const content = Object.hasOwn(manifest, route) ? await ctx.db.query("pages").withIndex("by_route", q => q.eq("route", route)).unique() : null;
    const settings = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "menu")).unique();
    const rows = route === "/" || route === "/cases" ? await ctx.db.query("projects")
      .withIndex("by_published", q => q.gt("publishedAt", 0)).order("desc").take(50) :
      route === "/project" && slug && slugOK(slug) ? [await ctx.db.query("projects").withIndex("by_slug", q => q.eq("slug", slug)).unique()] : [];
    return { page: content?.live ?? null, menu: settings?.live?.filter(i => i.visible) ?? null, projects: rows.flatMap(r => r?.live ? [{
      slug: r.slug, content: route === "/project" ? r.live : { ...r.live, sections: [] },
    }] : []) };
  },
});
export const drafts = query({
  args: {},
  returns: v.object({
    pages: v.array(v.object({ route: v.string(), draft: page, live: v.union(page, v.null()), revision: v.number() })),
    menu: v.union(v.null(), v.object({ draft: menu, live: v.union(menu, v.null()), revision: v.number() })),
    projects: v.array(v.object({ slug: v.string(), draft: project, live: v.union(project, v.null()), revision: v.number() })),
  }),
  handler: async ctx => {
    await editor(ctx.auth);
    const p = await ctx.db.query("pages").take(32);
    const m = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "menu")).unique();
    const j = await ctx.db.query("projects").take(100);
    return {
      pages: p.map(({ route, draft, live, revision }) => ({ route, draft, live, revision })),
      menu: m && { draft: m.draft, live: m.live, revision: m.revision },
      projects: j.map(({ slug, draft, live, revision }) => ({ slug, draft, live, revision })),
    };
  },
});
export const savePage = mutation({
  args: { route: v.string(), value: page, revision: v.number(), publish: v.boolean() }, returns: v.number(),
  handler: async (ctx, { route, value, revision, publish }) => {
    await editor(ctx.auth);
    const draft = cleanPage(route, value);
    const row = await ctx.db.query("pages").withIndex("by_route", q => q.eq("route", route)).unique();
    checkRevision(row?.revision ?? 0, revision);
    const patch = { draft, live: publish ? draft : row?.live ?? null, revision: revision + 1 };
    if (row) await ctx.db.patch("pages", row._id, patch); else await ctx.db.insert("pages", { route, ...patch });
    return patch.revision;
  },
});
export const saveMenu = mutation({
  args: { value: menu, revision: v.number(), publish: v.boolean() }, returns: v.number(),
  handler: async (ctx, { value, revision, publish }) => {
    await editor(ctx.auth);
    const draft = cleanMenu(value);
    const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "menu")).unique();
    checkRevision(row?.revision ?? 0, revision);
    const patch = { draft, live: publish ? draft : row?.live ?? null, revision: revision + 1 };
    if (row) await ctx.db.patch("settings", row._id, patch); else await ctx.db.insert("settings", { key: "menu", ...patch });
    return patch.revision;
  },
});
export const saveProject = mutation({
  args: { slug: v.string(), value: project, revision: v.number(), publish: v.boolean() }, returns: v.number(),
  handler: async (ctx, { slug, value, revision, publish }) => {
    await editor(ctx.auth);
    if (!slugOK(slug)) fail("Use lowercase letters, numbers, and hyphens in the project URL.");
    const draft = cleanProject(value, publish);
    const row = await ctx.db.query("projects").withIndex("by_slug", q => q.eq("slug", slug)).unique();
    checkRevision(row?.revision ?? 0, revision);
    if (!row && (await ctx.db.query("projects").take(100)).length >= 100) fail("The project library is full.");
    const patch = { draft, live: publish ? draft : row?.live ?? null, revision: revision + 1, publishedAt: publish ? row?.publishedAt || Date.now() : row?.publishedAt ?? 0 };
    if (row) await ctx.db.patch("projects", row._id, patch); else await ctx.db.insert("projects", { slug, ...patch });
    return patch.revision;
  },
});
export const removeProject = mutation({
  args: { slug: v.string(), revision: v.number(), deleteDraft: v.boolean() }, returns: v.null(),
  handler: async (ctx, { slug, revision, deleteDraft }) => {
    await editor(ctx.auth);
    const row = await ctx.db.query("projects").withIndex("by_slug", q => q.eq("slug", slug)).unique();
    if (!row) return null;
    checkRevision(row.revision, revision);
    if (deleteDraft && row.live) fail("Unpublish this project before deleting its draft.");
    if (deleteDraft) await ctx.db.delete("projects", row._id);
    else await ctx.db.patch("projects", row._id, { live: null, publishedAt: 0, revision: revision + 1 });
    return null;
  },
});
