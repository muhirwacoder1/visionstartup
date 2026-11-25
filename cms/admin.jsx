import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ClerkProvider, SignIn, UserButton, useAuth} from '@clerk/react';
import {ConvexReactClient, useAction, useConvexAuth, useMutation, useQuery} from 'convex/react';
import {ConvexProviderWithClerk} from 'convex/react-clerk';
import {makeFunctionReference as ref} from 'convex/server';
import catalog from './catalog.json';

const defaults = [
  {id:'work', label:'Projects', href:'/cases/', visible:true},
  {id:'studio', label:'Studio', href:'/about/', visible:true},
  {id:'testimonials', label:'Testimonials', href:'/testimonials/', visible:true},
  {id:'contact', label:'Contact', href:'/contact/', visible:true},
];
const blankPage = {fields:{}, hidden:[]};
const empty = {pages:[], menu:null, projects:[]};
const blankProject = () => ({title:'', category:'', year:'', summary:'', cover:'', coverAlt:'', hoverImage:'', featured:true, sections:[]});
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64).replace(/-$/,'');
const getLocal = () => { try { return JSON.parse(localStorage.getItem('nixtio-editor-drafts-v1')) || empty; } catch { return empty; } };
const message = e => typeof e.data === 'string' ? e.data : e.message?.split('\n')[0] || 'Something went wrong.';
const id = () => crypto.randomUUID().slice(0,8);
const config = window.NIXTIO_CONFIG || {};
const configured = Boolean(config.convexUrl && config.clerkKey);
const localMode = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);

function Icon({name, size=18}) {
  const shapes = {
    pages:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    projects:<><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4h8v2M3 12h18M10 12v2h4v-2"/></>,
    menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
    access:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    media:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 5-5 3 3 3-4 3 4"/></>,
    guide:<><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 3 3v1M12 16v1"/></>,
    desktop:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6m-3-4v4"/></>,
    mobile:<><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>,
    arrow:<path d="M6 18 18 6m-8 0h8v8"/>,
    upload:<path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5"/>,
    plus:<path d="M12 5v14M5 12h14"/>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
function Brand() { return <div className="brand"><span aria-hidden="true">n<span>.</span></span><div>Nixtio <small>CONTENT STUDIO</small></div></div>; }
function Gate({title, copy, children}) { return <main className="gate"><Brand/><p className="eyebrow">PRIVATE WORKSPACE</p><h1>{title}</h1><p>{copy}</p>{children}<a className="quiet" href="/">Back to website <Icon name="arrow" size={14}/></a></main>; }
function Remote() {
  const {isLoading, isAuthenticated} = useConvexAuth();
  const {isLoaded, isSignedIn, userId} = useAuth();
  const role = useQuery(ref('cmsPermissions:myRole'), isAuthenticated ? {} : 'skip');
  const data = useQuery(ref('content:drafts'), role ? {} : 'skip');
  const assets = useQuery(ref('library:list'), role ? {} : 'skip');
  const page = useMutation(ref('content:savePage'));
  const menu = useMutation(ref('content:saveMenu'));
  const project = useMutation(ref('content:saveProject'));
  const remove = useMutation(ref('content:removeProject'));
  const begin = useAction(ref('storage:begin'));
  const finish = useAction(ref('storage:finish'));
  const download = useAction(ref('storage:download'));
  if (!isLoaded || isLoading || (isAuthenticated && role === undefined) || (role && !data)) return <Gate title="Opening the studio…" copy="Checking your sign-in and loading your drafts."/>;
  if (!isSignedIn) return <Gate title="Sign in to edit" copy="Use your approved Clerk account to open the content studio."><SignIn routing="hash" forceRedirectUrl="/admin/"/></Gate>;
  if (!role) return <Gate title="Editor access required" copy="Share your CMS account ID with the site owner to request access.">
    {userId && <label className="field">CMS account ID<input value={userId} readOnly onFocus={event=>event.target.select()}/></label>}
    <UserButton/>
  </Gate>;
  const upload = async file => {
    const {url, key} = await begin({name:file.name,mime:file.type,size:file.size});
    const response = await fetch(url, {method:'PUT', headers:{'Content-Type':file.type}, body:file});
    if (!response.ok) throw new Error('The original could not be uploaded to R2. Try again.');
    return await finish({key});
  };
  return <Studio data={data} assets={assets || []} actions={{page,menu,project,remove,upload,download}} role={role} remote/>;
}
function Local() {
  const [data, setData] = useState(getLocal);
  const [assets, setAssets] = useState([]);
  const write = next => {
    const disk = JSON.parse(JSON.stringify(next, (_, value) => typeof value === 'string' && value.startsWith('blob:') ? '' : value));
    localStorage.setItem('nixtio-editor-drafts-v1',JSON.stringify(disk));
    setData(next);
  };
  const save = kind => async ({route,slug,value,revision}) => {
    const record = {draft:value,live:null,revision:revision+1};
    if (kind === 'menu') write({...data,menu:record});
    else {
      const group = kind === 'page' ? 'pages' : 'projects';
      const key = kind === 'page' ? 'route' : 'slug';
      const name = route || slug;
      write({...data,[group]:[...data[group].filter(row => row[key] !== name),{...record,[key]:name}]});
    }
    return record.revision;
  };
  return <Studio data={data} assets={assets} actions={{page:save('page'), menu:save('menu'), project:save('project'),
    remove:async ({slug})=>write({...data, projects:data.projects.filter(row=>row.slug!==slug)}),
    upload:async file=>{
      const asset = {key:id(),name:file.name,mime:file.type,size:file.size,url:URL.createObjectURL(file)+(file.type.startsWith('video/')?'#video':'')};
      setAssets(list=>[asset,...list]); return asset;
    },
  }}/>;
}

function AssetField({label,value,onChange,kind='media',assets,upload,notify,embed=false}) {
  const [busy,setBusy] = useState(false);
  const [picker,setPicker] = useState(false);
  const matches = assets.filter(a => kind !== 'image' || a.mime.startsWith('image/'));
  const video = /\/video\/upload\/|\.(mp4|mov|webm)(\?|$)|#video$/i.test(value);
  const image = !video && (/^\/assets\/|^blob:|^https:\/\/res\.cloudinary\.com\//.test(value));
  return <div className="asset-field">
    <label className="field">{label}<input value={value} onChange={e=>onChange(e.target.value)} placeholder={embed ? 'https://player.vimeo.com/video/…' : 'Choose or upload a file'}/></label>
    {image && <img className="thumb" src={value} alt="Current image" loading="lazy"/>}
    {video && <video className="thumb" src={value} muted playsInline controls preload="metadata"/>}
    <div className="inline">
      {!embed && <label className={'button small '+(busy?'busy':'')}><Icon name="upload" size={14}/>{busy?'Uploading…':'Upload'}<input type="file" className="visually-hidden" disabled={busy}
        accept={kind==='image'?'image/jpeg,image/png,image/webp,image/avif':'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime'}
        onChange={async e=>{
          const file=e.target.files?.[0]; e.target.value=''; if(!file)return;
          const valid = /^(image\/(jpeg|png|webp|avif)|video\/(mp4|webm|quicktime))$/.test(file.type);
          const limit = file.type.startsWith('image/') ? 10 : 50;
          if (kind === 'image' && !file.type.startsWith('image/')) { notify('Choose a JPG, PNG, WebP, or AVIF image.',true); return; }
          if (!valid || !file.size || file.size > limit*1024*1024) { notify('Choose an image up to 10 MB or a video up to 50 MB.',true); return; }
          setBusy(true);
          try { const a=await upload(file); onChange(a.url); notify('Media added to this draft.'); }
          catch (error) { notify(message(error),true); } finally { setBusy(false); }
        }}/></label>}
      {!embed && matches.length > 0 && <button className="button small" onClick={()=>setPicker(!picker)} type="button">{picker?'Close library':'Choose from library'}</button>}
      {value && <button className="button small" onClick={()=>onChange('')} type="button">Remove from field</button>}
    </div>
    {picker && <div className="asset-picker">{matches.map(a=><button className="button small" key={a.key} type="button" onClick={()=>{onChange(a.url);setPicker(false);}}>{a.name}</button>)}</div>}
  </div>;
}
function Preview({path, page, menu, projects, section, focusKey, onNavigate}) {
  const iframe = useRef(null);
  const [device,setDevice] = useState(()=>matchMedia('(max-width: 620px)').matches ? 'mobile' : 'desktop');
  const [scale,setScale] = useState(.65);
  const area = useRef(null);
  const route = path.split('?')[0].replace(/\/+$/,'') || '/';
  const src = route === '/' ? '/' : route+'/' +(path.includes('?')?'?'+path.split('?').slice(1).join('?'):'');
  const width = device==='desktop' ? 1280 : 390;
  const height = device==='desktop' ? 850 : 844;
  const payload = useRef({});
  const pendingFocus = useRef(null);
  const send = () => iframe.current?.contentWindow?.postMessage({type:'nixtio-preview',...payload.current,focus:pendingFocus.current},location.origin);
  useEffect(()=>{payload.current={route,page,menu,projects}; send();},[route,page,menu,projects]);
  useEffect(()=>{
    pendingFocus.current = /^section-/.test(section||'') ? section : 'top';
    send();
  },[path,section,focusKey]);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setScale(Math.min(1,(entry.contentRect.width-18)/width)));
    observer.observe(area.current); return ()=>observer.disconnect();
  },[width]);
  useEffect(()=>{
    function receive(event) {
      if (event.origin!==location.origin || event.source!==iframe.current?.contentWindow) return;
      if (event.data?.type==='nixtio-ready') send();
      if (event.data?.type==='nixtio-focused') pendingFocus.current=null;
      if (event.data?.type==='nixtio-navigate') onNavigate(event.data.path);
    }
    addEventListener('message',receive); return ()=>removeEventListener('message',receive);
  },[onNavigate]);
  return <section className="preview" aria-label="Site preview">
    <div className="preview-bar"><div><span className="indicator"/><strong>Live preview</strong><small> DRAFT</small></div><div className="device-group">
      <button type="button" aria-label="Desktop preview" aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}><Icon name="desktop"/></button>
      <button type="button" aria-label="Mobile preview" aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}><Icon name="mobile"/></button>
    </div></div>
    <div className="preview-address"><span>↗</span> {path}</div>
    <div className="preview-area" ref={area}>
      <div className="viewport" style={{width:width*scale,height:height*scale}}>
        <iframe title="Draft website" src={src} ref={iframe} onLoad={send} style={{width,height,transform:'scale('+scale+')'}}/>
      </div>
    </div>
    <p className="preview-caption">You’re seeing the site’s actual layout. This preview is visible only here.</p>
  </section>;
}

const studioTabs = [{id:'pages',label:'Pages',icon:'pages'},{id:'projects',label:'Projects',icon:'projects'},
  {id:'menu',label:'Site menu',icon:'menu'},{id:'media',label:'Media library',icon:'media'},{id:'guide',label:'Editing guide',icon:'guide'}];
function Studio({data,assets,actions,role,remote=false}) {
  const tabs = role === 'superadmin'
    ? [...studioTabs,{id:'access',label:'Team access',icon:'access'}]
    : studioTabs;
  const [selectedTab,setTab] = useState('pages');
  const tab = tabs.some(item=>item.id===selectedTab) ? selectedTab : 'pages';
  const showPreview = ['pages','projects','menu'].includes(tab);
  const [route,setRoute] = useState('/');
  const [section,setSection] = useState('');
  const [search,setSearch] = useState('');
  const [pageWork,setPageWork] = useState({});
  const [menuWork,setMenuWork] = useState(null);
  const [projectWork,setProjectWork] = useState({});
  const [selected,setSelected] = useState('');
  const [newSlug,setNewSlug] = useState('');
  const [previewPath,setPreviewPath] = useState('');
  const [focusKey,setFocusKey] = useState(0);
  const [notice,setNotice] = useState(null);
  const [saving,setSaving] = useState(false);
  const [confirm,setConfirm] = useState(null);
  const notify = (text, error=false) => setNotice({text,error});
  const current = catalog.find(p=>p.key===route) || catalog[0];
  const pageRow = data.pages.find(p=>p.route===route);
  const pageEdit = pageWork[route]?.value ?? pageRow?.draft ?? blankPage;
  const menuEdit = menuWork?.value ?? data.menu?.draft ?? defaults;
  const projRow = data.projects.find(p=>p.slug===selected);
  const projEdit = projectWork[selected]?.value ?? projRow?.draft;
  const activeSection = current.sections.find(s=>s.id===section) || (route==='/' ? current.sections.find(s=>s.title.startsWith('We create')) : current.sections.find(s=>s.title!=='Header')) || current.sections[0];
  const slug = selected === '~new' ? (newSlug || slugify(projEdit?.title || '')) : selected;
  const previewSlug = slug || 'new-project';
  const activePath = previewPath || (tab==='projects' && projEdit ? '/project/?slug='+previewSlug : tab==='pages' ? route : '/');
  const previewRoute = activePath.split('?')[0].replace(/\/+$/,'') || '/';
  const previewPage = pageWork[previewRoute]?.value || data.pages.find(p=>p.route===previewRoute)?.draft || blankPage;
  const previewProjects = data.projects.filter(p=>p.slug!==selected || tab!=='projects').map(p=>({slug:p.slug,content:projectWork[p.slug]?.value || p.draft}));
  if (tab==='projects' && projEdit) previewProjects.unshift({slug:previewSlug,content:projEdit});
  const editing = tab==='pages' || tab==='menu' || tab==='projects' && projEdit;
  const dirty = tab==='pages' ? !!pageWork[route] : tab==='menu' ? !!menuWork : !!projectWork[selected];
  const live = tab==='pages' ? pageRow?.live : tab==='menu' ? data.menu?.live : projRow?.live;
  const draft = tab==='pages' ? pageRow?.draft : tab==='menu' ? data.menu?.draft : projRow?.draft;
  const unsaved = Object.keys(pageWork).length || menuWork || Object.keys(projectWork).length;
  useEffect(()=>{ if(!unsaved) return; const handler=e=>{e.preventDefault();e.returnValue='';}; addEventListener('beforeunload',handler); return ()=>removeEventListener('beforeunload',handler); },[unsaved]);

  const setField = (field,value) => {
    const fields={...pageEdit.fields};
    if (value===field.value) delete fields[field.id]; else fields[field.id]=value;
    setPageWork({...pageWork,[route]:{value:{...pageEdit,fields},revision:pageWork[route]?.revision ?? pageRow?.revision ?? 0}});
  };
  const updateProject = patch => setProjectWork(previous => {
    const editingProject = previous[selected];
    return {
      ...previous,
      [selected]: {
        value: {...(editingProject?.value ?? projRow?.draft ?? blankProject()), ...patch},
        revision: editingProject?.revision ?? projRow?.revision ?? 0,
      },
    };
  });
  const updateMenu = value => setMenuWork({value,revision:menuWork?.revision ?? data.menu?.revision ?? 0});
  const updateBlock = (i,patch) => updateProject({sections:projEdit.sections.map((s,index)=>index===i?{...s,...patch}:s)});
  const uploadProps = {assets,upload:actions.upload,notify};
  const reset = () => {
    if (tab==='menu') setMenuWork(null);
    else if (tab==='pages') setPageWork(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>key!==route)));
    else setProjectWork(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>key!==selected)));
  };
  async function save(publish) {
    if (tab==='projects' && (!slug || !projEdit?.title.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) { notify('Enter a project title and a URL with lowercase letters, numbers and hyphens.',true); return; }
    if (tab==='projects' && selected==='~new' && data.projects.some(p=>p.slug===slug)) { notify('That project URL is already in use.',true); return; }
    setSaving(true); setNotice(null);
    try {
      if (tab==='pages') await actions.page({route,value:pageEdit,revision:pageWork[route]?.revision ?? pageRow?.revision ?? 0,publish});
      if (tab==='menu') await actions.menu({value:menuEdit,revision:menuWork?.revision ?? data.menu?.revision ?? 0,publish});
      if (tab==='projects') await actions.project({slug,value:projEdit,revision:projectWork[selected]?.revision ?? projRow?.revision ?? 0,publish});
      reset();
      if (tab==='projects' && selected==='~new') setSelected(slug);
      notify(publish?'Published to the website.':remote?'Draft saved.':'Draft saved in this browser. Local files are kept for this session only.');
    } catch (e) { notify(message(e),true); }
    finally { setSaving(false); }
  }
  async function removeProject(deleteDraft) {
    setSaving(true);
    try {
      await actions.remove({slug:selected,revision:projRow.revision,deleteDraft});
      if (deleteDraft) { reset(); setSelected(''); }
      notify(deleteDraft?'Draft removed.':'Project unpublished. The draft and media remain in the studio.');
    } catch(e) { notify(message(e),true); }
    finally { setSaving(false); setConfirm(null); }
  }
  function chooseTab(next) {setTab(next);setPreviewPath('');setNotice(null);}
  function newProject() {
    setNewSlug(''); setSelected('~new'); setPreviewPath('');
    if (!projectWork['~new']) setProjectWork({...projectWork,'~new':{value:blankProject(),revision:0}});
  }
  function navigate(path) {
    const key=path.split('?')[0].replace(/\/+$/,'') || '/';
    if (key==='/project' || catalog.some(p=>p.key===key)) setPreviewPath(path);
  }
  const pageSections=current.sections;
  const visibleFields = activeSection?.fields.slice().sort((a,b)=>Number(b.value===activeSection.title)-Number(a.value===activeSection.title)).filter(f=>!search || (f.label+' '+f.value).toLowerCase().includes(search.toLowerCase())) || [];
  return <div className="studio">
    <aside className="sidebar"><Brand/><p className="side-label">WORKSPACE</p><nav aria-label="Studio sections">{tabs.map(t=><button key={t.id} aria-current={tab===t.id?'page':undefined} onClick={()=>chooseTab(t.id)}><Icon name={t.icon}/>{t.label}</button>)}</nav><a className="site-link" href="/" target="_blank" rel="noreferrer">View website <Icon name="arrow" size={15}/></a></aside>
    <main className="work">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {tabs.find(t=>t.id===tab).label}</div><div className="inline"><span className={'badge '+(remote?'online':'')}>{remote?(role==='superadmin'?'Super admin':'Editor'):'Local preview'}</span>{remote && <UserButton/>}</div></header>
      <div className="content">
        {!remote && <div className="banner"><strong>Local preview.</strong> Drafts stay in this browser. Publishing and cloud uploads require the connected services.</div>}
        <div className="heading"><div><p className="eyebrow">CONTENT MANAGEMENT</p><h1>{tab==='pages'?'Page content':tabs.find(t=>t.id===tab).label}</h1>
          <p>{({pages:'Edit copy and media in the site’s existing sections.',projects:'Create case studies and choose which ones to feature.',menu:'Choose the links visitors see, and put them in order.',media:'Reuse images and video from one place.',guide:'A quick guide to previewing and publishing.',access:'Grant and revoke CMS editor access.'})[tab]}</p></div>
          {editing && <div className="actions">
            <button className="button" disabled={saving || !dirty} onClick={()=>save(false)}>Save draft</button>
            <button className="button primary" disabled={!remote || saving} onClick={()=>setConfirm('publish')}>Publish</button>
          </div>}
        </div>
        {notice && <div className={'notice '+(notice.error?'error':'')} role={notice.error?'alert':'status'}>{notice.text}<button aria-label="Dismiss message" onClick={()=>setNotice(null)}>×</button></div>}
        <div className={'layout '+(showPreview?'':'wide')}>
          <section className="editor" aria-label={tabs.find(t=>t.id===tab).label}>
            {tab==='pages' && <>
              <div className="panel-top"><label className="field">Page<select value={route} onChange={e=>{setRoute(e.target.value);setSection('');setSearch('');setPreviewPath('');}}>{[...catalog].sort((a,b)=>(a.key==='/'?-1:b.key==='/'?1:a.key.localeCompare(b.key))).map(p=><option key={p.key} value={p.key}>{p.title} {p.key==='/'?'':' · '+p.key}</option>)}</select></label>
                <label className="field">Section<select value={activeSection?.id || ''} onChange={e=>{setSection(e.target.value);setSearch('');setPreviewPath('');setFocusKey(x=>x+1);}}>{pageSections.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
              </div>
              <div className="fields">
                <div className="section-head"><h2>{activeSection?.title}</h2><span className="badge">{visibleFields.length} fields</span></div>
                {activeSection?.hideable && <label className="check"><input type="checkbox" checked={!pageEdit.hidden.includes(activeSection.id)} onChange={e=>setPageWork({...pageWork,[route]:{value:{...pageEdit,hidden:e.target.checked?pageEdit.hidden.filter(id=>id!==activeSection.id):[...pageEdit.hidden,activeSection.id]},revision:pageWork[route]?.revision ?? pageRow?.revision ?? 0}})}/> Show this section</label>}
                {activeSection?.id==='section-0' && <p className="hint">Main navigation is edited in <button className="text-button" onClick={()=>chooseTab('menu')}>Site menu</button>.</p>}
                {activeSection?.fields.length>12 && <label className="field">Find a field<input type="search" placeholder="Search this section…" value={search} onChange={e=>setSearch(e.target.value)}/></label>}
                {visibleFields.map(field=>{
                  const value=Object.hasOwn(pageEdit.fields,field.id)?pageEdit.fields[field.id]:field.value;
                  return <div className="field-group" key={field.id}>
                    {['image','media'].includes(field.type) ? <AssetField {...uploadProps} label={field.label} value={value} kind={field.type} embed={field.value.includes('player.vimeo.com')} onChange={v=>setField(field,v)}/> : field.type==='toggle' ? <label className="check"><input type="checkbox" checked={value==='true'} onChange={e=>setField(field,String(e.target.checked))}/>{field.label}</label> :
                    <label className="field">{field.type==='link'?'Link · ':''}{field.label}{field.value.length>75 && field.type==='text'?<textarea rows={4} value={value} onChange={e=>setField(field,e.target.value)}/>:<input value={value} onChange={e=>setField(field,e.target.value)}/>}</label>}
                    {Object.hasOwn(pageEdit.fields,field.id) && <button className="text-button small" onClick={()=>setField(field,field.value)}>Restore original</button>}
                  </div>;
                })}
                {!visibleFields.length && <p className="hint">No matching fields.</p>}
              </div>
            </>}
            {tab==='menu' && <div className="fields">
              <div className="section-head"><h2>Navigation links</h2><span className="badge">{menuEdit.filter(i=>i.visible).length} visible</span></div>
              <p className="hint">Changes apply to the desktop and mobile menus. Hide a link to keep it available for later.</p>
              {menuEdit.map((item,i)=><div className="block" key={item.id}>
                <div className="section-head"><strong>{i+1}. {item.label || 'New link'}</strong><div className="inline">
                  <button className="button small" disabled={!i} aria-label={'Move '+item.label+' up'} onClick={()=>updateMenu(menuEdit.map((v,j)=>j===i?menuEdit[i-1]:j===i-1?item:v))}>↑</button>
                  <button className="button small" disabled={i===menuEdit.length-1} aria-label={'Move '+item.label+' down'} onClick={()=>updateMenu(menuEdit.map((v,j)=>j===i?menuEdit[i+1]:j===i+1?item:v))}>↓</button>
                </div></div>
                <label className="field">Label<input maxLength={34} value={item.label} onChange={e=>updateMenu(menuEdit.map((v,j)=>j===i?{...v,label:e.target.value}:v))}/></label>
                <label className="field">Destination<input list="page-destinations" value={item.href} onChange={e=>updateMenu(menuEdit.map((v,j)=>j===i?{...v,href:e.target.value}:v))}/></label>
                <div className="section-head"><label className="check"><input type="checkbox" checked={item.visible} onChange={e=>updateMenu(menuEdit.map((v,j)=>j===i?{...v,visible:e.target.checked}:v))}/> Show in menu</label>
                <button className="text-button danger" onClick={()=>updateMenu(menuEdit.filter((_,j)=>j!==i))}>Remove</button></div>
              </div>)}
              <datalist id="page-destinations">{catalog.map(p=><option key={p.key} value={p.key}/>)}</datalist>
              <button className="button" disabled={menuEdit.length>=10} onClick={()=>updateMenu([...menuEdit,{id:id(),label:'New link',href:'/',visible:true}])}><Icon name="plus" size={16}/> Add link</button>
            </div>}
            {tab==='projects' && <>
              <div className="panel-top">
                <div className="section-head"><h2>Recent projects</h2><button className="button small" onClick={newProject}><Icon name="plus" size={15}/> New project</button></div>
                <label className="field">Select a project<select value={selected} onChange={e=>{setSelected(e.target.value);setPreviewPath('');}}>
                  <option value="">Choose a project</option>{projectWork['~new'] && <option value="~new">Unsaved project</option>}
                  {data.projects.map(p=><option key={p.slug} value={p.slug}>{p.draft.title} · {p.live?'Published':'Draft'}</option>)}
                </select></label>
              </div>
              {!projEdit && <div className="fields"><h2>Your case studies</h2><p className="hint">Add a project to preview its cover, project card, and detail page. Existing reference case studies can be edited under Pages.</p></div>}
              {projEdit && <div className="fields">
                <label className="field">Project title<input maxLength={100} value={projEdit.title} onChange={e=>updateProject({title:e.target.value})}/></label>
                <label className="field">Project URL<input value={selected==='~new'?newSlug || slugify(projEdit.title):selected} readOnly={selected!=='~new'} onChange={e=>setNewSlug(slugify(e.target.value))}/></label>
                <p className="hint">The project URL stays fixed after the first save so links keep working.</p>
                <div className="pair"><label className="field">Category<input value={projEdit.category} onChange={e=>updateProject({category:e.target.value})}/></label>
                <label className="field">Year<input value={projEdit.year} onChange={e=>updateProject({year:e.target.value})}/></label></div>
                <label className="field">Summary<textarea rows={4} value={projEdit.summary} onChange={e=>updateProject({summary:e.target.value})}/></label>
                <AssetField {...uploadProps} label="Cover image" value={projEdit.cover} kind="image" onChange={v=>updateProject({cover:v})}/>
                <label className="field">Cover image description<input value={projEdit.coverAlt} onChange={e=>updateProject({coverAlt:e.target.value})}/></label>
                <AssetField {...uploadProps} label="Hover image (optional)" value={projEdit.hoverImage ?? ''} kind="image" onChange={hoverImage=>updateProject({hoverImage})}/>
                <p className="hint">Choose Project card below, then hover over the card to preview the reveal. Use the same crop as the cover.</p>
                <label className="check"><input type="checkbox" checked={projEdit.featured} onChange={e=>updateProject({featured:e.target.checked})}/> Feature on the homepage</label>
                <div className="inline"><button className="button small" onClick={()=>setPreviewPath('')}>Detail preview</button><button className="button small" onClick={()=>setPreviewPath('/cases/')}>Project card</button>{projEdit.featured && <button className="button small" onClick={()=>setPreviewPath('/')}>Homepage</button>}</div>
                <h2>Case study content</h2>
                {projEdit.sections.map((s,i)=><div className="block" key={i}><div className="section-head"><strong>Block {i+1}</strong><div className="inline">
                  <button className="button small" aria-label={'Move block '+(i+1)+' up'} disabled={!i} onClick={()=>updateProject({sections:projEdit.sections.map((x,j)=>j===i?projEdit.sections[i-1]:j===i-1?s:x)})}>↑</button>
                  <button className="text-button danger" onClick={()=>updateProject({sections:projEdit.sections.filter((_,j)=>j!==i)})}>Remove block</button></div></div>
                  <label className="field">Heading<input value={s.title} onChange={e=>updateBlock(i,{title:e.target.value})}/></label>
                  <label className="field">Body<textarea rows={4} value={s.body} onChange={e=>updateBlock(i,{body:e.target.value})}/></label>
                  <AssetField {...uploadProps} label="Block media" value={s.media} onChange={v=>updateBlock(i,{media:v})}/>
                  <label className="field">Media description<input value={s.alt} onChange={e=>updateBlock(i,{alt:e.target.value})}/></label>
                </div>)}
                <button className="button" disabled={projEdit.sections.length>=20} onClick={()=>updateProject({sections:[...projEdit.sections,{title:'',body:'',media:'',alt:''}]})}><Icon name="plus" size={16}/> Add content block</button>
                {projRow && <div className="removal"><h3>{projRow.live?'Remove from the website':'Delete the project draft'}</h3>
                  <p className="hint">{projRow.live?'Unpublishing hides the case study and removes its cards. The draft remains editable.':'Deleting removes this saved draft. Its media stays in the library.'}</p>
                  <button className="button danger" disabled={saving} onClick={()=>setConfirm(projRow.live?'unpublish':'delete')}>{projRow.live?'Unpublish project':'Delete draft'}</button>
                </div>}
              </div>}
            </>}
            {tab==='media' && <div className="fields"><h2>Upload and reuse</h2><p className="hint">Images: JPG, PNG, WebP or AVIF, up to 10 MB. Video: MP4, WebM or MOV, up to 50 MB. Use media you own or have permission to publish. Originals stay private in R2; Cloudinary delivery links can be opened by anyone with the link.</p>
              <LibraryUpload {...uploadProps}/>
              {!assets.length && <p className="hint">No uploads yet. Upload a file here or directly from a page or project field.</p>}
              <div className="library-grid">{assets.map(a=><article className="block" key={a.key}>{a.mime.startsWith('image/')?<img src={a.url} alt="" loading="lazy"/>:<video src={a.url} controls muted preload="metadata"/>}<strong>{a.name}</strong><small>{(a.size/1024/1024).toFixed(2)} MB</small>
                {remote && <button className="button small" onClick={async()=>{try { const href=await actions.download({key:a.key}); const link=document.createElement('a');link.href=href;link.rel='noreferrer';link.click(); } catch(e){notify(message(e),true);} }}>Download original</button>}
              </article>)}</div>
            </div>}
            {tab==='guide' && <div className="fields guide">
              <h2>From draft to live</h2><ol><li>Open a page and section, or start a new project.</li><li>Use the desktop and mobile previews. Check that text fits and the important part of each image is visible.</li><li>Save a draft to return later. Publish when you want visitors to see the update.</li></ol>
              <h2>Project media</h2><p>Use a wide cover (16:10 works well), aim for 1600 pixels across, and keep the subject near the center. Write a short image description for each image. Use content blocks for the brief, the design work, and the outcome.</p>
              <h2>Removing content</h2><p>Hide a section or menu link, then publish the change. Unpublish a project to remove it from the site and keep its draft. Delete the draft only when you no longer need it. Removing media from a field keeps the file in the library. Hide reference project cards individually in the Home or Projects page editor.</p>
              <h2>Reference content</h2><p>Replace reference project names, copy, and imagery with your own approved content before sharing the website publicly.</p>
            </div>}
            {tab==='access' && <TeamAccess notify={notify}/>}
            {editing && <div className="panel-bottom"><span className="badge">{dirty?'Unsaved changes':live && JSON.stringify(live)===JSON.stringify(draft)?'Published':draft?'Draft saved':'Ready to edit'}</span>
              {dirty && tab!=='projects' && <button className="text-button" onClick={reset}>Discard unsaved changes</button>}</div>}
          </section>
          {showPreview && <Preview path={activePath} page={previewPage} menu={menuWork || data.menu ? menuEdit : null} projects={previewProjects} section={tab==='pages' && !previewPath ? activeSection?.id : ''} focusKey={focusKey} onNavigate={navigate}/>}
        </div>
      </div>
      {confirm && <div className="modal-backdrop"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{confirm==='publish'?'Publish these changes?':confirm==='delete'?'Delete this project draft?':'Unpublish this project?'}</h2>
        <p>{confirm==='publish'?'Your changes will appear on the live website.':confirm==='delete'?'The draft will be removed. Uploaded files stay in the media library.':'Visitors will no longer see the project. You can edit and republish it later.'}</p>
        <div className="actions"><button className="button" autoFocus onClick={()=>setConfirm(null)}>Cancel</button><button className="button primary" onClick={()=>{if(confirm==='publish'){setConfirm(null);save(true);}else removeProject(confirm==='delete');}} disabled={saving}>{confirm==='publish'?'Publish':confirm==='delete'?'Delete draft':'Unpublish'}</button></div>
      </section></div>}
    </main>
  </div>;
}
function TeamAccess({notify}) {
  const editors = useQuery(ref('cmsPermissions:listEditors'), {});
  const grant = useMutation(ref('cmsPermissions:grantEditor'));
  const revoke = useMutation(ref('cmsPermissions:revokeEditor'));
  const [userId,setUserId] = useState('');
  const [label,setLabel] = useState('');
  const [pending,setPending] = useState(false);

  async function changeAccess(operation, success) {
    setPending(true);
    try {
      await operation();
      notify(success);
    } catch (error) {
      notify(message(error),true);
    } finally {
      setPending(false);
    }
  }

  return <div className="fields">
    <h2>Grant editor access</h2>
    <p className="hint">Ask the person to sign in at /admin/ and share the CMS account ID shown on their screen. Editors can change and publish site content. Only you can manage access.</p>
    <form className="block access-form" onSubmit={event=>{
      event.preventDefault();
      void changeAccess(async()=>{
        await grant({userId,label});
        setUserId('');
        setLabel('');
      },'Editor access granted.');
    }}>
      <label className="field">CMS account ID<input required placeholder="user_…" value={userId} maxLength={110} onChange={event=>setUserId(event.target.value)}/></label>
      <label className="field">Name (optional)<input maxLength={100} value={label} onChange={event=>setLabel(event.target.value)}/></label>
      <button className="button primary" type="submit" disabled={pending || !userId.trim()}>Grant editor access</button>
    </form>
    <h2>Current access</h2>
    <div className="block access-row"><strong>You</strong><span className="badge online">Super admin</span></div>
    {editors === undefined && <p className="hint">Loading editors…</p>}
    {editors?.length===0 && <p className="hint">No other editors have access.</p>}
    {editors?.map(({userId:editorId,label:editorName})=><div key={editorId} className="block access-row">
      <div>{editorName && <strong>{editorName}</strong>}<code>{editorId}</code></div>
      <button className="button danger" type="button" disabled={pending} onClick={()=>{
        void changeAccess(()=>revoke({userId:editorId}),'Editor access revoked.');
      }}>Revoke access</button>
    </div>)}
  </div>;
}
function LibraryUpload(props) {
  const [value,setValue]=useState('');
  return <AssetField {...props} assets={[]} label="Upload media" value={value} onChange={setValue}/>;
}

const root=createRoot(document.getElementById('studio'));
if (localMode && new URLSearchParams(location.search).get('preview') === 'local') root.render(<Local/>);
else if (configured) {
  const client=new ConvexReactClient(config.convexUrl);
  root.render(<ClerkProvider publishableKey={config.clerkKey}><ConvexProviderWithClerk client={client} useAuth={useAuth}><Remote/></ConvexProviderWithClerk></ClerkProvider>);
} else if (localMode) root.render(<Local/>);
else root.render(<Gate title="Studio setup in progress" copy="Clerk sign-in and the content backend need to be connected before this editor can open."/>);
