#!/usr/bin/env node
/*
 * Captures the Theme Builder's live preview from a real Jellyfin web client.
 *
 * It logs in to a Jellyfin server, renders the home page and an item page in a headless
 * browser (desktop and phone layouts) and saves the resulting markup plus Jellyfin's own
 * stylesheets under site/preview/. The builder page then loads the real theme files into
 * that markup, so the preview is the actual Jellyfin UI running the actual theme.
 *
 * Two sources of content:
 *   DEMO=1  the public Jellyfin demo server (public-domain and openly licensed films): real titles,
 *           posters, backdrops and logos, downloaded small. The web client itself still comes from JF_URL,
 *           and every API call is forwarded to the demo server. Needs a local server only for the
 *           Media Bar Enhanced files (JF_USER / JF_PASS of that server; skipped if it cannot log in).
 *   default a private server: every API response is rewritten (titles, people, overviews, studios,
 *           paths, user and server names) and all artwork is generated, so nothing from the library is kept.
 * Cast photos are real in DEMO mode (generated otherwise); user avatars are always generated. Plugin scripts and custom CSS are blocked, and
 * the markup is stock Jellyfin.
 *
 * Needs Playwright (npm i playwright, then npx playwright install chromium).
 *   DEMO=1 JF_URL=http://localhost:8096 JF_USER=name JF_PASS=password node site/tools/capture-preview.mjs
 * Jellyfin's web client is GPL-2.0; see site/preview/NOTICE.md.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../preview');
const JF = (process.env.JF_URL || 'http://localhost:8096').replace(/\/$/, '');   // serves the web client
// DEMO=1: titles, posters and details come from the public Jellyfin demo server (open-licensed and
// public-domain films) instead of a private library. The web client still comes from JF.
const DEMO = process.env.DEMO === '1';
const ONLY = process.env.ONLY || '';   // e.g. ONLY='livetv|lib': capture just the pages whose names start so, and add them to what is already saved
const wanted = (name) => !ONLY || new RegExp(`^(${ONLY})`).test(name);
const API = DEMO ? (process.env.DEMO_URL || 'https://demo.jellyfin.org/stable').replace(/\/$/, '') : JF;
const REAL = DEMO;   // real titles and artwork; otherwise everything is generated
const { JF_USER, JF_PASS } = process.env;
if (!JF_USER && !DEMO) throw new Error('Set JF_USER and JF_PASS (or DEMO=1)');

/* ---------- deterministic fictional content ---------- */
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (list, seed, salt = 0) => list[(hash(seed) + salt * 7919) % list.length];
const ADJ = ['Silent', 'Midnight', 'Crimson', 'Hollow', 'Paper', 'Velvet', 'Distant', 'Neon', 'Iron', 'Golden', 'Quiet', 'Broken', 'Wild', 'Salt', 'Amber', 'Winter', 'Glass', 'Northern', 'Last', 'Electric'];
const NOUN = ['Harbor', 'Lantern', 'Orchard', 'Signal', 'Tide', 'Garden', 'Compass', 'Ferry', 'Atlas', 'Echo', 'Meadow', 'Static', 'Summit', 'Mirror', 'Orbit', 'Station', 'Voyage', 'Lighthouse', 'Archive', 'Horizon'];
const FIRST = ['Alex', 'Jordan', 'Sam', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Quinn', 'Avery', 'Rowan', 'Elliot', 'Robin', 'Harper', 'Dana', 'Kai', 'Noor'];
const LAST = ['Marsh', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Whitlock', 'Duarte', 'Hale', 'Petrov', 'Singh', 'Calloway', 'Reyes', 'Nakamura', 'Frost', 'Vega', 'Bishop'];
const SENT = [
  'A quiet lighthouse keeper finds that the tide leaves something new on the shore every evening.',
  'Two radio operators on a remote station start hearing a broadcast from their own future.',
  'When the last ferry stops running, a small island town has to decide who it wants to be.',
  'An archivist uncovers a hidden map in a box of letters and follows it across three countries.',
  'A retired pilot and a stubborn teenager restore an old aircraft before the season changes.',
  'The night shift at a city observatory is interrupted by a signal nobody can explain.',
];
const title = (id) => { const t = `${pick(ADJ, id)} ${pick(NOUN, id, 1)}`; return hash(id + 't') % 3 === 0 ? `The ${t}` : t; };
const person = (id) => `${pick(FIRST, id)} ${pick(LAST, id, 1)}`;
const overview = (id) => `${pick(SENT, id)} ${pick(SENT, id, 3)}`;
const LIBNAME = { movies: 'Movies', tvshows: 'TV Shows', music: 'Music', homevideos: 'Home Videos', books: 'Books', boxsets: 'Collections', playlists: 'Playlists', livetv: 'Live TV' };

const libNames = new Map(); // library id -> unique name ("Movies", then "Anime", ...)
const SPARE = ['Anime', 'Documentaries', 'Kids', 'Classics', 'Concerts'];
const libName = (id, type) => {
  if (!libNames.has(id)) {
    const base = LIBNAME[type] || 'Library';
    const taken = new Set(libNames.values());
    libNames.set(id, !taken.has(base) ? base : SPARE.find((n) => !taken.has(n)) || `${base} ${libNames.size}`);
  }
  return libNames.get(id);
};
// Live TV: neither server has a schedule worth showing, so the guide is generated. Titles are open-licensed
// or public-domain films and shorts, and made-up channels and programmes; nothing here is a real broadcast.
const CHANNELS = [
  ['Movies', [['Behind the Scenes', 30], ['Big Buck Bunny', 30], ['Sintel', 60], ['Tears of Steel', 30], ['Cosmos Laundromat', 30]]],
  ['Classics', [['Night of the Living Dead', 120], ['His Girl Friday', 105], ['Dracula', 90]]],
  ['Silent', [['Nosferatu', 90], ['The General', 120], ['Sherlock Jr.', 60]]],
  ['News', [['The World Tonight', 60], ['News at the Hour', 30], ['Business Today', 45], ['Weather Watch', 15]], { IsNews: true }],
  ['Sports', [['Tennis Tonight', 150], ['Football Highlights', 90], ['Cycling: Mountain Stage', 120]], { IsSports: true }],
  ['Kids', [['Drawing Time', 30], ['Caminandes', 30], ['Sprite Fright', 30], ['Spring', 20]], { IsKids: true }],
  ['Nature', [['Wild Coasts', 60], ['Life in the Forest', 120], ['Night Skies', 60]]],
];
const hex32 = (seed) => [0, 1, 2, 3].map((i) => hash(seed + i).toString(16).padStart(8, '0')).join('');
const channelId = (i) => hex32('channel' + i);
function liveTv(p, url) {
  const day = 86400000;
  if (/\/LiveTv\/GuideInfo$/i.test(p)) {
    const start = new Date(); start.setMinutes(0, 0, 0);
    return { StartDate: start.toISOString(), EndDate: new Date(+start + 7 * day).toISOString() };
  }
  if (/\/LiveTv\/Channels$/i.test(p)) {
    const Items = CHANNELS.map(([Name], i) => ({ Name, ServerId: hex32('server'), Id: channelId(i), ChannelId: null, Number: String(i + 1), ChannelNumber: String(i + 1), IsFolder: false, Type: 'TvChannel', ImageTags: {}, LocationType: 'Remote', MediaType: 'Video', ChannelType: 'TV' }));
    return { Items, TotalRecordCount: Items.length, StartIndex: 0 };
  }
  if (/\/LiveTv\/Programs$/i.test(p)) {
    const q = url.searchParams, ids = (q.get('channelIds') || q.get('ChannelIds') || '').split(',').filter(Boolean);
    const from = new Date(q.get('MinEndDate') || Date.now()), to = new Date(q.get('MaxStartDate') || +from + day);
    const Items = [];
    CHANNELS.forEach(([ChannelName, list, flags = {}], i) => {
      if (!ids.includes(channelId(i))) return;
      // every channel runs from the previous midnight, so the schedule is the same whichever day is asked for
      const t0 = new Date(from); t0.setHours(0, 0, 0, 0);
      let t = +t0 - (i % 3) * 30 * 60000, n = i;
      while (t < +to) {
        const [Name, mins] = list[n++ % list.length], end = t + mins * 60000;
        if (end > +from) Items.push({ Name, ServerId: hex32('server'), Id: hex32(`program${i}-${t}`), ChannelId: channelId(i), ChannelName, ChannelNumber: String(i + 1), StartDate: new Date(t).toISOString(), EndDate: new Date(end).toISOString(), Type: 'Program', IsMovie: mins >= 90 && !Object.keys(flags).length, IsSeries: false, IsLive: false, IsNews: false, IsKids: false, IsSports: false, ImageTags: {}, ...flags });
        t = end;
      }
    });
    return { Items, TotalRecordCount: Items.length, StartIndex: 0 };
  }
  return null;
}
const names = new Map();   // item id -> title (used for generated artwork)
const kinds = new Map();   // item id -> item type
const people = new Set();  // ids of cast and crew (their photos are never shown)
function sanitize(node, ctx = {}) {
  if (Array.isArray(node)) return node.map((n) => sanitize(n, ctx));
  if (!node || typeof node !== 'object') return node;
  const o = {};
  const isItem = typeof node.Id === 'string' && ('Type' in node || 'MediaType' in node || 'CollectionType' in node);
  for (const [k, v] of Object.entries(node)) o[k] = (v && typeof v === 'object') ? sanitize(v, { ...ctx, key: k, parent: node }) : v;
  if (isItem) {
    const t = node.Type;
    let name;
    if (node.CollectionType && (t === 'CollectionFolder' || t === 'UserView')) name = libName(node.Id, node.CollectionType);
    else if (REAL) name = node.Name;
    else if (t === 'Season' && /^Season \d+$/.test(node.Name || '')) name = node.Name;
    else if (t === 'Season' || t === 'Genre' || t === 'MusicGenre') name = node.Name;
    else if (t === 'Person' || ctx.key === 'People') name = person(node.Id);
    else if (t === 'Studio') name = pick(['Harbor Pictures', 'Lantern Films', 'North Tide Studio', 'Paper Moon'], node.Id);
    else if (t === 'Episode') name = title(node.Id);
    else name = title(node.Id);
    if (ctx.key === 'People' || t === 'Person') people.add(node.Id);
    if (REAL) name = node.Name;
    else if (node.Name !== undefined) o.Name = name;
    names.set(node.Id, name);
    kinds.set(node.Id, t);
    if (!REAL) {
      if ('SortName' in o) o.SortName = name;
      if ('ForcedSortName' in o) o.ForcedSortName = name;
      if ('OriginalTitle' in o) o.OriginalTitle = name;
      if (o.Overview) o.Overview = overview(node.Id);
      if (o.Taglines) o.Taglines = [`${title(node.Id + 'x')}.`];
      if (o.SeriesName) o.SeriesName = title(node.SeriesId || node.Id);
      if (o.AlbumArtist) o.AlbumArtist = person(node.AlbumArtist);
    }
    if (o.Path) o.Path = `/media/library/${name.replace(/\W+/g, '_')}.mkv`;
    if ('FileName' in o) o.FileName = `${name.replace(/\W+/g, '_')}.mkv`;
    if ('ChannelName' in o) o.ChannelName = 'Channel 1';
    for (const k of REAL ? ['Chapters'] : ['Tags', 'ExternalUrls', 'RemoteTrailers', 'Chapters']) if (k in o) o[k] = [];
    if ('ProviderIds' in o && !REAL) o.ProviderIds = {};
    if ('ImageBlurHashes' in o) o.ImageBlurHashes = {};
    if (Array.isArray(o.MediaSources)) o.MediaSources = o.MediaSources.map((m) => ({ ...m, Path: `/media/library/${name.replace(/\W+/g, '_')}.mkv`, Name: m.Name && /\d{3,4}p/i.test(m.Name) ? m.Name.match(/\d{3,4}p/i)[0] : 'Default', ETag: undefined }));
    if (Array.isArray(o.Studios) && !REAL) o.Studios = o.Studios.map((s) => ({ ...s, Name: pick(['Harbor Pictures', 'Lantern Films', 'North Tide Studio'], s.Id || s.Name) }));
  }
  if (node.ServerName) o.ServerName = 'Jellyfin Server';
  if (node.LocalAddress) o.LocalAddress = 'http://localhost:8096';
  if (node.Username || (node.Policy && node.Name)) { o.Name = 'Alex'; }
  if ('CustomCss' in o) o.CustomCss = '';
  if ('SplashscreenEnabled' in o) o.SplashscreenEnabled = false;
  // home screen: a plain, complete set of sections
  if (o.CustomPrefs && /^homesection\d/.test(Object.keys(o.CustomPrefs).join(' '))) {
    // My Media, Continue Watching, then "Recently added" (series with unwatched counts, watched ticks)
    const secs = ['smalllibrarytiles', 'resume', 'latestmedia', 'none', 'none', 'none', 'none', 'none', 'none', 'none'];
    secs.forEach((s, i) => { o.CustomPrefs[`homesection${i}`] = s; });
  }
  return o;
}

/* ---------- generated artwork ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function art(id, type, w, h) {
  const t = names.get(id) || title(id);
  const h1 = hash(id) % 360, h2 = (h1 + 40 + (hash(id + 'b') % 70)) % 360;
  const d1 = `hsl(${h1} 55% 24%)`, d2 = `hsl(${h2} 60% 12%)`, glow = `hsl(${(h1 + 20) % 360} 70% 45%)`;
  if (type === 'Logo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300"><text x="450" y="170" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${Math.min(104, Math.floor(820 / (t.length * 0.72)))}" letter-spacing="2" fill="#fff" stroke="#0006" stroke-width="2">${esc(t.toUpperCase())}</text></svg>`;
  }
  if (type === 'User') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#ffb347"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="78" r="36" fill="#fff8"/><ellipse cx="100" cy="178" rx="64" ry="50" fill="#fff8"/></svg>`;
  }
  if (type === 'Person') {
    const ini = person(id).split(' ').map((x) => x[0]).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="${d1}"/><circle cx="200" cy="230" r="90" fill="${glow}" opacity=".55"/><text x="200" y="260" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="84" fill="#fff">${esc(ini)}</text></svg>`;
  }
  const landscape = w >= h;
  const label = type === 'Backdrop' ? '' : `<text x="${w / 2}" y="${h * (landscape ? 0.55 : 0.82)}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${Math.round(Math.min(w, h) * (landscape ? 0.11 : 0.085))}" fill="#fff" opacity=".92" stroke="#0005" stroke-width="1">${esc(t)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d1}"/><stop offset="1" stop-color="${d2}"/></linearGradient><radialGradient id="r" cx=".72" cy=".3" r=".6"><stop offset="0" stop-color="${glow}" stop-opacity=".75"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#a)"/><rect width="${w}" height="${h}" fill="url(#r)"/><circle cx="${w * 0.78}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.2}" fill="${glow}" opacity=".35"/><path d="M0 ${h * 0.78} Q ${w * 0.3} ${h * 0.6} ${w * 0.6} ${h * 0.76} T ${w} ${h * 0.7} V ${h} H0 Z" fill="#000" opacity=".35"/>${label}</svg>`;
}
/* Every image the page asks for is turned into a file under art/. Posters, backdrops, logos and
   thumbnails of real titles are fetched small from the API (DEMO mode); cast photos, user avatars
   and anything else are generated. */
// The demo server has no collections, so a few are made from its films: each has its own id and borrows the artwork
// of one film (src). Everything a collection page asks for is answered from real films.
let BOXES = [];   // { id, src, name, skip }
const COLLECTIONS_VIEW = hex32('collections-view');
const param = (url, name) => [...url.searchParams].find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
const boxOf = (text) => BOXES.find((b) => text.includes(b.id));
function boxItem(src, box) {
  const body = { ...src };
  Object.assign(body, { Id: box.id, Type: 'BoxSet', Name: box.name, IsFolder: true, ChildCount: 8, People: [], Overview: box.overview, Taglines: [], RemoteTrailers: [], Chapters: [], Genres: [], GenreItems: [], Tags: [], TagItems: [], Studios: [] });
  ['MediaSources', 'MediaStreams', 'RunTimeTicks', 'MediaType', 'Video3DFormat', 'Path', 'Container', 'Width', 'Height', 'CriticRating', 'CommunityRating', 'ProviderIds', 'ExternalUrls', 'ProductionYear', 'PremiereDate', 'OriginalTitle', 'OfficialRating', 'ParentLogoItemId', 'ParentLogoImageTag', 'UserData'].forEach((k) => delete body[k]);
  if (body.ImageTags) body.ImageTags = { ...body.ImageTags, Logo: undefined };   // the title shows as text
  return body;
}
const imageStore = new Map();   // key -> { file }
let AUTH_HEADER = {};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
async function imageFile(url) {
  { const b = boxOf(url.href); if (b) url = new URL(url.href.replaceAll(b.id, b.src)); }
  const m = url.pathname.match(/\/Items\/([^/]+)\/Images\/(\w+)(?:\/(\d+))?/);
  const type = m ? m[2] : 'User';
  const id = m ? m[1] : 'user';
  const idx = m && m[3] ? m[3] : '';
  const isPerson = people.has(id) || kinds.get(id) === 'Person';
  const kind = kinds.get(id);
  const landscape = ['Episode', 'Video'].includes(kind);
  const real = REAL && m && ['Primary', 'Backdrop', 'Thumb', 'Logo', 'Banner', 'Art'].includes(type);
  const key = real ? `real/${id}/${type}/${idx}` : null;
  if (key && imageStore.has(key)) return imageStore.get(key);
  if (real) {
    const w = { Primary: landscape ? 640 : isPerson ? 300 : 420, Backdrop: 1280, Thumb: 640, Banner: 640, Logo: 560, Art: 560 }[type];
    const keepAlpha = type === 'Logo' || type === 'Art';
    const u = `${API}/Items/${id}/Images/${type}${idx ? '/' + idx : ''}?maxWidth=${w}&quality=${type === 'Backdrop' ? 62 : 72}${keepAlpha ? '' : '&format=jpg'}`;
    try {
      const r = await fetch(u, { headers: AUTH_HEADER });
      if (r.ok) {
        const ctype = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
        const body = Buffer.from(await r.arrayBuffer());
        const file = `art/${hash(key).toString(36)}.${EXT[ctype] || 'jpg'}`;
        fs.mkdirSync(path.join(OUT, 'art'), { recursive: true });
        fs.writeFileSync(path.join(OUT, file), body);
        const rec = { file, body, ctype };
        imageStore.set(key, rec);
        return rec;
      }
    } catch { /* fall through to generated artwork */ }
  }
  // generated artwork
  const q = url.searchParams;
  const num = (k) => Number(q.get(k)) || 0;
  let w = num('fillWidth') || num('maxWidth') || num('width');
  let h = num('fillHeight') || num('maxHeight') || num('height');
  let t2 = type;
  if (/^\/Users\//.test(url.pathname)) t2 = 'User';
  else if (isPerson && type === 'Primary') t2 = 'Person';
  if (!w || !h) {
    if (type === 'Backdrop' || type === 'Thumb' || type === 'Banner' || landscape) { w = 1280; h = 720; } else { w = 600; h = 900; }
  } else { const sc = 1000 / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
  const gkey = `gen/${id}/${t2}/${w}x${h}`;
  if (imageStore.has(gkey)) return imageStore.get(gkey);
  const svg = art(id, t2, w, h);
  const file = `art/${hash(gkey).toString(36)}.svg`;
  fs.mkdirSync(path.join(OUT, 'art'), { recursive: true });
  fs.writeFileSync(path.join(OUT, file), svg);
  const rec = { file, body: Buffer.from(svg), ctype: 'image/svg+xml' };
  imageStore.set(gkey, rec);
  return rec;
}
const imageUrlFile = new Map();   // full request URL -> file, for pages that asked for it
async function imageForUrl(url) {
  const rec = await imageFile(url);
  imageUrlFile.set(url.href, rec.file);
  return rec;
}

/* ---------- capture ---------- */
const PLUGIN = /JavaScriptInjector|MediaBarEnhanced|JellyfinEnhanced|HomeScreen|KefinTweaks|FileTransformation|jellyfin-plugin|\/Plugins?\//i;
const PURE = 'https://raw.githubusercontent.com/IAmParadox27/jellyfin-plugin-media-bar/main/slideshowpure';   // Media Bar (DBAD licence)
async function login(base, user, pass) {
  const r = await fetch(`${base}/Users/AuthenticateByName`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Client="Jellyfin Web", Device="Preview", DeviceId="jellyfish-preview", Version="12.2.0"' }, body: JSON.stringify({ Username: user, Pw: pass }) });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  const j = await r.json();
  return { token: j.AccessToken, userId: j.User.Id, serverId: j.ServerId };
}
const authHeader = (a) => ({ Authorization: `MediaBrowser Token="${a.token}"` });
async function pickItem(auth) {
  const q = REAL ? 'SortBy=SortName' : 'SortBy=Random';
  const r = await (await fetch(`${API}/Items?IncludeItemTypes=Movie&Recursive=true&Limit=60&Fields=People&${q}&userId=${auth.userId}`, { headers: authHeader(auth) })).json();
  const ok = r.Items.filter((i) => i.ImageTags?.Logo && i.BackdropImageTags?.length && i.People?.length > 6);
  // Night of the Living Dead has photos for most of its cast; Dracula's are mostly missing on the demo server
  return (REAL && ok.find((i) => /Night of the Living Dead/.test(i.Name))) || ok[0] || r.Items[0];
}
async function findId(auth, re) {
  const r = await (await fetch(`${API}/Items?IncludeItemTypes=Movie&Recursive=true&userId=${auth.userId}`, { headers: authHeader(auth) })).json();
  return (r.Items.find((i) => re.test(i.Name)) || r.Items[0]).Id;
}

async function findNamed(auth, type, re) {
  const r = await (await fetch(`${API}/Items?IncludeItemTypes=${type}&Recursive=true&userId=${auth.userId}`, { headers: authHeader(auth) })).json();
  return (r.Items.find((i) => re.test(i.Name)) || r.Items[0]).Id;
}
async function findPerson(auth, re) {
  const r = await (await fetch(`${API}/Persons?userId=${auth.userId}&Limit=500`, { headers: authHeader(auth) })).json();
  return (r.Items.find((i) => re.test(i.Name)) || r.Items.find((i) => i.ImageTags?.Primary)).Id;
}

async function capture(browser, auth, { name, width, height, mobile, hash, plugin, backdropOf, livetv, views: withViews }, localAuth) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile, userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
  await ctx.addInitScript(({ auth, base, layout }) => {
    localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [{ ManualAddress: base, manualAddressOnly: true, Id: auth.serverId, UserId: auth.userId, AccessToken: auth.token, DateLastAccessed: Date.now(), LastConnectionMode: 2, Name: 'Jellyfin Server' }] }));
    localStorage.setItem('_deviceId2', 'jellyfish-preview');
    if (layout) localStorage.setItem('layout', layout);
    localStorage.setItem(auth.userId + '-enableBackdrops', 'true');   // Settings > Display > Backdrops on, the setting the theme is designed for
  }, { auth, base: JF, layout: mobile ? 'mobile' : null });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== JF) return route.abort();
    const p = url.pathname;
    // Media Bar Enhanced's own files and settings come from the local server that has the plugin
    if (plugin === 'enhanced' && /^\/MediaBarEnhanced\//i.test(p)) {
      if (!localAuth) return route.continue();
      return route.continue({ headers: { ...req.headers(), authorization: `MediaBrowser Token="${localAuth.token}"` } });
    }
    if (PLUGIN.test(p)) return route.abort();
    if (/^\/Branding\/Css/i.test(p)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    // Live TV answers from the generated schedule; other pages (home) just find nothing to show
    if (/^\/LiveTv\//i.test(p)) {
      const data = livetv ? liveTv(p, url) : null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data || { Items: [], TotalRecordCount: 0, StartIndex: 0 }) });
    }
    if (/\/Images\//.test(p) || /^\/Users\/[^/]+\/Images\//.test(p)) { const rec = await imageForUrl(url); return route.fulfill({ status: 200, contentType: rec.ctype, body: rec.body }); }
    if (p === '/' || p.startsWith('/web')) return route.continue();
    let res, target = p + url.search;
    const box = boxOf(target);
    if (box) {
      const sp = new URLSearchParams(url.search);
      if (sp.get('ParentId') === box.id) { sp.delete('ParentId'); sp.set('StartIndex', String(box.skip)); sp.set('Recursive', 'true'); sp.set('IncludeItemTypes', 'Movie'); sp.set('SortBy', 'SortName'); sp.set('Limit', '8'); }
      target = p.replaceAll(box.id, box.src) + '?' + sp.toString().replaceAll(box.id, box.src);
    }
    // the Collections library: its contents are the made-up collections
    if (BOXES.length && /\/Items\/Latest$/.test(p) && param(url, 'parentId') === COLLECTIONS_VIEW) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (BOXES.length && (param(url, 'parentId') === COLLECTIONS_VIEW || p.endsWith('/Items/' + COLLECTIONS_VIEW))) {
      const base = p.endsWith('/Items/' + COLLECTIONS_VIEW)
        ? { Id: COLLECTIONS_VIEW, Name: 'Collections', Type: 'CollectionFolder', CollectionType: 'boxsets', IsFolder: true, ServerId: hex32('server'), ImageTags: {} }
        : { Items: await Promise.all(BOXES.map(async (b) => boxItem(await (await fetch(`${API}/Users/${auth.userId}/Items/${b.src}`, { headers: AUTH_HEADER })).json(), b))), StartIndex: 0 };
      if (base.Items) base.TotalRecordCount = base.Items.length;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sanitize(base)) });
    }
    try { res = await route.fetch(DEMO ? { url: API + target } : undefined); } catch { return route.continue(); }
    if (process.env.DEBUG && !res.ok()) console.warn(res.status(), p + url.search.slice(0, 120));
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return route.fulfill({ response: res });
    let body;
    try { body = sanitize(await res.json()); } catch { return route.fulfill({ response: res }); }
    if (box && p.endsWith('/Items/' + box.id) && body.Id) body = boxItem(body, box);
    // Media Bar Enhanced draws a logo when a title has one: offer it only titles that do.
    if (plugin === 'enhanced' && Array.isArray(body.Items) && /\/Items$/.test(p)) body.Items = body.Items.filter((i) => i.ImageTags?.Logo);
    // The demo user has nothing in progress: show a few titles part-way through instead.
    if (DEMO && /\/Items\/Resume/.test(p) && Array.isArray(body.Items) && !body.Items.length) {
      const q = new URL(url.href); q.pathname = p.replace(/\/Items\/Resume.*/, '/Items'); q.searchParams.delete('MediaTypes');
      q.searchParams.set('IncludeItemTypes', 'Movie'); q.searchParams.set('Recursive', 'true'); q.searchParams.set('SortBy', 'SortName'); q.searchParams.set('Limit', '14');
      const more = await (await fetch(API + q.pathname + q.search, { headers: AUTH_HEADER })).json();
      body = sanitize(more); body.Items = (body.Items || []).filter((i) => i.BackdropImageTags?.length).slice(0, 5);
    }
    // make the sample content show every kind of badge
    if (/\/Items\/Resume/.test(p) && Array.isArray(body.Items)) body.Items.forEach((it, i) => { it.UserData = { ...(it.UserData || {}), PlayedPercentage: [62, 28, 80, 45][i % 4], Played: false }; });
    if (/\/Items\/Latest/.test(p) && Array.isArray(body)) body.forEach((it, i) => { it.UserData = { ...(it.UserData || {}), Played: i % 4 === 1, UnplayedItemCount: it.Type === 'Series' ? [3, 12, 7][i % 3] : undefined }; });
    // TV shows first, so the rows with unwatched-episode counts come before the movie rows
    const views = Array.isArray(body.Items) && /\/Views\b|\/UserViews\b/i.test(p) ? body.Items : null;
    if (views) views.sort((a, b) => (b.CollectionType === 'tvshows') - (a.CollectionType === 'tvshows'));
    // Collections and Live TV libraries, as a fuller server would have. Only the library pages ask for them: the home page
    // loads a row per library and stops when it meets one it cannot fill, so the other pages get the two links added to their
    // header afterwards (see addNavLinks).
    if (withViews && views && !views.some((i) => i.CollectionType === 'boxsets')) views.push({ Name: 'Collections', ServerId: hex32('server'), Id: COLLECTIONS_VIEW, Type: 'UserView', CollectionType: 'boxsets', ImageTags: {}, IsFolder: true });
    if (withViews && views && !views.some((i) => i.CollectionType === 'livetv')) views.push({ Name: 'Live TV', ServerId: hex32('server'), Id: hex32('livetv'), Type: 'UserView', CollectionType: 'livetv', ImageTags: {}, IsFolder: true });
    return route.fulfill({ response: res, body: JSON.stringify(body), contentType: 'application/json' });
  });
  const page = await ctx.newPage();
  if (plugin && plugin.startsWith('pure:')) await ctx.addInitScript((layout) => { window.SlideshowConfig = { layout, enableTrailers: false }; }, plugin.slice(5));
  if (process.env.DEBUG) { page.on('requestfailed', (r) => console.warn('failed', r.url().slice(0, 140), r.failure()?.errorText)); page.on('console', (m) => m.type() === 'error' && console.warn('console', m.text().slice(0, 200))); }
  if (process.env.DEBUG) page.on('pageerror', (e) => console.warn('pageerror', e.message.slice(0, 200)));
  await page.goto(`${JF}/web/#${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(plugin ? 3000 : Number(process.env.WAIT) || 7000);
  if (plugin && plugin.startsWith('pure:')) {
    const [css, js] = await Promise.all([fetch(`${PURE}.css`).then((r) => r.text()), fetch(`${PURE}.js`).then((r) => r.text())]);
    await page.evaluate((c) => { const st = document.createElement('style'); st.id = 'pure-css'; st.textContent = c; document.head.prepend(st); }, css);
    await page.addScriptTag({ content: js });
  }
  if (plugin) await page.waitForTimeout(9000);
  const bdUrl = backdropOf ? `${JF}/Items/${backdropOf}/Images/Backdrop/0` : null;
  const snap = await page.evaluate((bdUrl) => {
    const css = [], pluginCss = [];
    let iconFont = null;
    for (const s of document.styleSheets) {
      const mine = (s.ownerNode && s.ownerNode.id === 'pure-css') || /MediaBarEnhanced/i.test(s.href || '');
      try {
        for (const r of s.cssRules) {
          (mine ? pluginCss : css).push(r.cssText);
          if (r.type === CSSRule.FONT_FACE_RULE && /Material Icons/.test(r.style.fontFamily)) iconFont = (r.style.src.match(/url\("([^"]+\.woff2)"\)/) || [])[1] || iconFont;
        }
      } catch { /* cross-origin */ }
    }
    const sc = document.querySelector('#slides-container');
    let fragment = null;
    if (sc) {
      sc.querySelectorAll('iframe, video, .video-container, .bar-loading').forEach((e) => e.remove());
      const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''));
      fragment = { html: sc.outerHTML, parent: sel(sc.parentElement), htmlClass: document.documentElement.className, bodyClass: document.body.className };
    }
    const root = document.querySelector('#reactRoot');
    // The page backdrop on the home screen is a random title; use the chosen one so the capture is repeatable.
    if (bdUrl) document.querySelectorAll('.backdropImage').forEach((e) => { if (e.style.backgroundImage) e.style.backgroundImage = `url("${bdUrl}")`; });
    // Jellyfin loads card images lazily as they scroll into view. The saved page has no loader, so
    // every image that has not loaded yet is set directly.
    root.querySelectorAll('[data-src]').forEach((e) => {
      const u = e.getAttribute('data-src');
      if (e.tagName === 'IMG') e.src = u; else e.style.backgroundImage = `url("${u}")`;
      e.classList.remove('lazy'); e.classList.add('lazy-image-fadein-fast'); e.removeAttribute('data-src');
    });
    // drop pages that are not on screen
    root.querySelectorAll('.page.hide, .mainAnimatedPages > .hide').forEach((e) => e.remove());
    root.querySelectorAll('script, noscript, link[rel=stylesheet]').forEach((e) => e.remove());
    return {
      css, pluginCss, fragment, iconFont,
      html: root.outerHTML,
      htmlClass: document.documentElement.className,
      htmlAttrs: Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])),
      bodyAttrs: Object.fromEntries([...document.body.attributes].map((a) => [a.name, a.value])),
      title: document.title,
      nav: [...document.querySelectorAll('.MuiToolbar-root a[href^="#/"]')].map((a) => a.getAttribute('href')),
    };
  }, bdUrl);
  await page.screenshot({ path: path.join(OUT, `_${name}.png`) });
  await ctx.close();
  return snap;
}

const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IMG_URL = new RegExp(`${escRe(JF)}/(?:Items/[\\w-]+/Images/\\w+(?:/\\d+)?|Users/[\\w-]+/Images/\\w+)(?:(?!&quot;|&#34;)[^"'\\s)<>])*`, 'g');
async function artify(html) {
  // Cards further down the page are lazy-loaded and were never requested while capturing, so find
  // every image address in the markup and make sure each has a file.
  const urls = new Set((html.replaceAll('&amp;', '&').match(IMG_URL) || []));
  for (const u of urls) {
    const url = new URL(u);
    const rec = imageUrlFile.has(url.href) ? { file: imageUrlFile.get(url.href) } : await imageForUrl(url);
    html = html.split(u).join(rec.file).split(u.replaceAll('&', '&amp;')).join(rec.file);
  }
  return html.replaceAll(JF + '/', '').replaceAll(JF, '');
}
async function writeSlideshow(name, snap) {
  if (!snap.fragment) { console.warn('no slideshow found for', name); return; }
  const f = snap.fragment;
  const base = (f2) => f2.split(/\s+/).filter(Boolean);
  fs.writeFileSync(path.join(OUT, `ss-${name}.json`), JSON.stringify({ ...f, html: await artify(f.html), htmlClass: base(f.htmlClass), bodyClass: base(f.bodyClass) }));
  const kind = name === 'enhanced' ? 'enhanced' : 'pure';
  const css = snap.pluginCss.join('\n').replaceAll(JF, '');
  if (css) fs.writeFileSync(path.join(OUT, `plugin-${kind}.css`), css);
}

async function write(name, snap, sheet) {
  const html = await artify(snap.html);
  const attrs = Object.entries(snap.htmlAttrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
  // body attributes matter: the theme has rules such as ".layout-desktop [dir=ltr] ..." that match <body dir="ltr">
  const bodyAttrs = Object.entries(snap.bodyAttrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
  const doc = `<!doctype html>\n<html ${attrs}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${snap.title}</title>\n<link rel="stylesheet" href="${sheet}.css">\n<style id="jfp-theme"></style>\n</head>\n<body ${bodyAttrs}>\n${html}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(OUT, `${name}.html`), doc);
}

/* The top bar of pages captured without the Collections and Live TV libraries gets their two links, copied from a page that has them. */
function addNavLinks() {
  const src = path.join(OUT, 'lib-movies-desktop.html');
  if (!fs.existsSync(src)) return;
  const html = fs.readFileSync(src, 'utf8');
  const anchor = (key) => (html.match(new RegExp(`<a [^>]*href="#/${key}[^"]*"[^>]*>.*?</a>`)) || [])[0];
  const links = [anchor('boxsets'), anchor('livetv')];
  if (links.some((l) => !l)) { console.warn('Collections / Live TV links not found'); return; }
  for (const f of fs.readdirSync(OUT).filter((n) => /^(home|item-\w+)-desktop\.html$/.test(n))) {
    const file = path.join(OUT, f), page = fs.readFileSync(file, 'utf8');
    if (page.includes('href="#/boxsets')) continue;
    const next = page.replace(/(<a [^>]*href="#\/playlists[^"]*"[^>]*>.*?<\/a>)/, `$1${links.join('')}`);
    if (next !== page) fs.writeFileSync(file, next);
  }
}

(async () => {
  if (!ONLY) fs.rmSync(path.join(OUT, 'art'), { recursive: true, force: true });   // start from a clean set of images
  fs.mkdirSync(OUT, { recursive: true });
  const auth = DEMO ? await login(API, process.env.DEMO_USER || 'demo', process.env.DEMO_PASS || '') : await login(JF, JF_USER, JF_PASS);
  AUTH_HEADER = authHeader(auth);
  // Media Bar Enhanced is installed on the local server, not on the demo one
  const localAuth = DEMO && JF_USER ? await login(JF, JF_USER, JF_PASS).catch(() => null) : null;
  if (DEMO && !localAuth) console.warn('No local login: the Media Bar Enhanced slideshow will not be captured');
  const item = await pickItem(auth);
  const bdId = REAL ? await findId(auth, /^Dracula$/) : item.Id;   // the page backdrop behind the home rows
  const browser = await chromium.launch();
  const variants = [
    { name: 'enhanced', plugin: 'enhanced' }, { name: 'marquee', plugin: 'pure:marquee' },
    { name: 'classic', plugin: 'pure:classic' }, { name: 'plate', plugin: 'pure:plate' },
  ];
  // The item page in each kind of item. The demo server has no collection, so BOX stands in for one.
  BOXES = [
    { name: 'Open Movie Collection', src: bdId, overview: 'Public-domain and openly licensed films: silent-era landmarks, early horror and Blender Foundation shorts.' },
    { name: 'Silent Era', src: await findNamed(auth, 'Movie', /Great Train Robbery/), overview: 'Landmarks from before sound.' },
    { name: 'Horror Classics', src: item.Id, overview: 'Early horror, now in the public domain.' },
    { name: 'Blender Open Movies', src: await findNamed(auth, 'Movie', /Caminandes/), overview: 'Short films made in the open with Blender.' },
  ].map((b, i) => ({ ...b, id: hex32('boxset' + i), skip: i * 2 }));
  const kinds2 = {
    movie: item.Id,
    series: await findNamed(auth, 'Series', /Pioneer One/),
    person: await findPerson(auth, /Dwight Frye/),
    collection: BOXES[0].id,
    playlist: await findNamed(auth, 'Playlist', /Binaerpilot/),
    album: await findNamed(auth, 'MusicAlbum', /Nemesis/),
  };
  const itemShots = Object.entries(kinds2).flatMap(([kind, id]) => [
    { name: `item-${kind}-desktop`, width: 1440, height: 900, hash: `/details?id=${id}` },
    { name: `item-${kind}-mobile`, width: 390, height: 844, mobile: true, hash: `/details?id=${id}` },
  ]);
  const shots = [
    { name: 'home-desktop', width: 1440, height: 900, hash: '/home', backdropOf: bdId },
    { name: 'home-mobile', width: 390, height: 844, mobile: true, hash: '/home', backdropOf: bdId },
    { name: 'livetv-desktop', width: 1440, height: 900, hash: '/livetv.html?tab=1', livetv: true, views: true },
    { name: 'livetv-mobile', width: 390, height: 844, mobile: true, hash: '/livetv.html?tab=1', livetv: true, views: true },
    ...itemShots,
  ];
  // One stylesheet per layout: each page adds the stylesheets its own views load, and the phone
  // layout sets global rules (e.g. a smaller root font size) that must not reach the desktop one.
  const rules = { desktop: new Set(), mobile: new Set() };
  let iconFontUrl = null;
  let nav = [];
  const run = async (s) => {
    const layout = s.mobile ? 'mobile' : 'desktop';
    const snap = await capture(browser, auth, s, localAuth);
    await write(s.name, snap, `jellyfin-${layout}`);
    snap.css.forEach((r) => rules[layout].add(r));
    if (snap.iconFont) iconFontUrl = snap.iconFont;
    if (s.name === 'home-desktop') { nav = snap.nav; console.log('nav', nav.join(' ')); }
    console.log('captured', s.name, `${(snap.html.length / 1024) | 0} KB`);
  };
  for (const s of shots.filter((x) => wanted(x.name))) await run(s);
  // the library pages behind the top bar's links, found from the links themselves
  const links = { favourites: /^#\/home\?tab=1/, shows: /^#\/tv\?/, movies: /^#\/movies\?.*collectionType=movies/, music: /^#\/music\?/, playlists: /^#\/(list|playlists)\b.*|^#\/\w+\?.*collectionType=playlists/, collections: /collectionType=boxsets/ };
  for (const [lib, re] of Object.entries(links)) {
    const href = lib === 'collections' ? `#/boxsets?topParentId=${COLLECTIONS_VIEW}&collectionType=boxsets` : nav.find((h) => re.test(h));
    if (!href) { if (nav.length) console.warn('no link for', lib); continue; }
    for (const mobile of [false, true]) {
      const s = { name: `lib-${lib}-${mobile ? 'mobile' : 'desktop'}`, width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile, hash: href.slice(1).replaceAll('&amp;', '&'), views: true };
      if (wanted(s.name)) await run(s);
    }
  }
  addNavLinks();
  for (const v of ONLY ? [] : variants) {
    const snap = await capture(browser, auth, { ...v, name: `ss-${v.name}`, width: 1440, height: 900, hash: '/home', backdropOf: bdId }, localAuth);
    await writeSlideshow(v.name, snap);
    console.log('captured slideshow', v.name);
  }
  // Jellyfin's own stylesheets, flattened. Fonts and server URLs are dropped (the theme brings its own).
  for (const layout of ['desktop', 'mobile']) {
    const file = path.join(OUT, `jellyfin-${layout}.css`);
    // With ONLY, the saved stylesheet is kept and just the rules it does not have yet are added.
    const saved = ONLY && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\n@font-face \{ font-family: "Material Icons".*\n/, '\n') : '';
    const css = [...rules[layout]].filter((r) => !r.startsWith('@font-face') && !/Jellyfish|jellyfish/.test(r)).map((r) => r.replaceAll(JF, '')).filter((r) => !saved.includes(r)).join('\n').replace(/^/, saved ? saved.trimEnd() + '\n' : '')
      // The slideshow plugins write icon names ("play_arrow") with Jellyfin's Material Icons font.
      + '\n@font-face { font-family: "Material Icons"; font-style: normal; font-weight: 400; font-display: block; src: url("assets/MaterialIcons-Regular.woff2") format("woff2"); }\n';
    fs.writeFileSync(file, css);
  }
  await browser.close();
  // stock images the markup refers to (rating icons, logo placeholder)
  const pages = fs.readdirSync(OUT).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(OUT, f), 'utf8')).join('\n');
  if (iconFontUrl) {
    const r = await fetch(new URL(iconFontUrl, `${JF}/web/`));
    fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'assets/MaterialIcons-Regular.woff2'), Buffer.from(await r.arrayBuffer()));
  } else console.warn('Material Icons font not found');
  const always = ['assets/img/fresh.svg', 'assets/img/rotten.svg'];
  for (const m of new Set([...always, ...(pages.match(/(?:assets\/img\/[\w.-]+\.(?:svg|png)|icon-transparent\.[\w]+\.png)/g) || [])])) {
    const r = await fetch(`${JF}/web/${m}`);
    if (!r.ok) { console.warn('missing asset', m); continue; }
    fs.mkdirSync(path.dirname(path.join(OUT, m)), { recursive: true });
    fs.writeFileSync(path.join(OUT, m), Buffer.from(await r.arrayBuffer()));
  }
  console.log('done:', OUT);
})();
