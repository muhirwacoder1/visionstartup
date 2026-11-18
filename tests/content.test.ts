import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../convex/_generated/api';
import schema from '../convex/schema';
import catalog from '../cms/catalog.json';
const modules = import.meta.glob('../convex/**/*.{ts,js}');
const empty = {fields:{}, hidden:[]};
const project = { title:'Test Studio', category:'Web design', year:'2026', summary:'An original project.', cover:'/assets/cover.webp', coverAlt:'Green shapes on a dark background', featured:true, sections:[] };
describe('CMS publication', () => {
  beforeEach(()=>vi.stubEnv('CMS_ADMIN_USER_IDS','editor-id'));
  afterEach(()=>vi.unstubAllEnvs());
  it('rejects drafts, writes, and media signing from unapproved accounts', async()=>{
    const t=convexTest(schema,modules);
    const other=t.withIdentity({subject:'other'});
    expect(await other.query(api.content.access,{})).toBe(false);
    expect(await t.query(api.content.access,{})).toBe(false);
    await expect(other.query(api.content.drafts,{})).rejects.toThrow('not authorized');
    await expect(other.mutation(api.content.savePage,{route:'/',value:empty,revision:0,publish:true})).rejects.toThrow('not authorized');
    await expect(other.action(api.storage.begin,{name:'file.png',mime:'image/png',size:20})).rejects.toThrow('not authorized');
  });
  it('keeps draft edits and hidden sections private until published and rejects stale saves', async()=>{
    const t=convexTest(schema,modules);
    const a=t.withIdentity({subject:'editor-id'});
    const home = catalog.find(page => page.key === '/')!;
    const hero = home.sections.find(section => section.title.startsWith('We create'))!;
    const heading = hero.fields.find(field => field.value.startsWith('We create'))!;
    const change={fields:{[heading.id]:'Sample'},hidden:[home.sections.find(s=>s.hideable)!.id]};
    await a.mutation(api.content.savePage,{route:'/',value:change,revision:0,publish:false});
    expect((await t.query(api.content.publicPage,{route:'/'})).page).toBeNull();
    await a.mutation(api.content.savePage,{route:'/',value:change,revision:1,publish:true});
    await a.mutation(api.content.savePage,{route:'/',value:empty,revision:2,publish:false});
    expect((await t.query(api.content.publicPage,{route:'/'})).page).toEqual(change);
    await expect(a.mutation(api.content.savePage,{route:'/',value:empty,revision:2,publish:true})).rejects.toThrow('newer version');
    await expect(a.mutation(api.content.savePage,{route:'/',value:{fields:{unknown:'bad'},hidden:[]},revision:3,publish:true})).rejects.toThrow('invalid');
  });
  it('publishes the chosen menu only and rejects unsafe destinations', async()=>{
    const t=convexTest(schema,modules);
    const a=t.withIdentity({subject:'editor-id'});
    const value=[{id:'home',label:'Home',href:'/',visible:true},{id:'work',label:'Work',href:'/cases/',visible:false}];
    await expect(a.mutation(api.content.saveMenu,{value:[{...value[0],href:'javascript:alert(1)'}],revision:0,publish:false})).rejects.toThrow('menu');
    await a.mutation(api.content.saveMenu,{value,revision:0,publish:false});
    expect((await t.query(api.content.publicPage,{route:'/about'})).menu).toBeNull();
    await a.mutation(api.content.saveMenu,{value,revision:1,publish:true});
    expect((await t.query(api.content.publicPage,{route:'/about'})).menu).toEqual(value.filter(item=>item.visible));
  });
  it('publishes project details, retains unpublished drafts, and clears their public cards', async()=>{
    const t=convexTest(schema,modules);
    const a=t.withIdentity({subject:'editor-id'});
    const slug='test-studio';
    await a.mutation(api.content.saveProject,{slug,value:project,revision:0,publish:false});
    expect((await t.query(api.content.publicPage,{route:'/project',slug})).projects).toEqual([]);
    await a.mutation(api.content.saveProject,{slug,value:project,revision:1,publish:true});
    expect((await t.query(api.content.publicPage,{route:'/project',slug})).projects).toEqual([{slug,content:project}]);
    expect((await t.query(api.content.publicPage,{route:'/cases'})).projects).toHaveLength(1);
    await expect(a.mutation(api.content.removeProject,{slug,revision:2,deleteDraft:true})).rejects.toThrow('Unpublish');
    await a.mutation(api.content.removeProject,{slug,revision:2,deleteDraft:false});
    expect((await t.query(api.content.publicPage,{route:'/cases'})).projects).toEqual([]);
    expect((await a.query(api.content.drafts,{})).projects[0].draft).toEqual(project);
    await a.mutation(api.content.removeProject,{slug,revision:3,deleteDraft:true});
    expect((await a.query(api.content.drafts,{})).projects).toEqual([]);
  });
  it('publishes a separate hover image on the project grids and keeps draft replacements private', async()=>{
    const t=convexTest(schema,modules);
    const editor=t.withIdentity({subject:'editor-id'});
    const slug='two-images';
    const hoverImage='/assets/alternate.webp';
    const value={...project,hoverImage};
    await editor.mutation(api.content.saveProject,{slug,value,revision:0,publish:true});
    await editor.mutation(api.content.saveProject,{slug,value:{...value,hoverImage:''},revision:1,publish:false});
    for (const route of ['/', '/cases']) {
      const {projects}=await t.query(api.content.publicPage,{route});
      expect(projects[0].content).toMatchObject({cover:project.cover,hoverImage});
    }
    await expect(editor.mutation(api.content.saveProject,{
      slug,value:{...value,hoverImage:'/assets/alternate.mp4'},revision:2,publish:false,
    })).rejects.toThrow('hover reveal');
    await editor.mutation(api.content.saveProject,{slug,value:{...value,hoverImage:''},revision:2,publish:true});
    expect((await t.query(api.content.publicPage,{route:'/cases'})).projects[0].content.hoverImage).toBe('');
  });
});
