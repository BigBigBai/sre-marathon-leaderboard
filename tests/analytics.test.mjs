import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker, { normalizeEvent, eventStatement, retentionStatements } from '../analytics/worker.mjs';
import { createAnalytics } from '../src/analytics.js';

const now = Date.now();
const id = () => crypto.randomUUID();
function event(overrides = {}) {
  const page = id();
  return {event_id:page,page_id:page,type:'page',occurred_at:now-5000,page:'home',session_id:id(),visitor_id:id(),is_returning:0,is_owner:0,referrer:'https://example.com/private?q=secret#private',utm_source:'paper',active_ms:3000,scroll_pct:50,...overrides};
}
function request(events, overrides = {}) {
  return new Request('https://analytics.example/collect',{method:'POST',headers:{Origin:'https://bigbigbai.github.io','Content-Type':'text/plain','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({events}),...overrides});
}
function database(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../analytics/migrations/0001_initial.sql',import.meta.url),'utf8'));
  t.after(() => sql.close());
  const db = {
    prepare(query) { return {bind(...args) { return {run:() => sql.prepare(query).run(...args)}; }}; },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = statements.map(s => s.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return {sql,db};
}
const allowed = {limit:async () => ({success:true})};
const envFor = db => ({DB:db,ALLOWED_ORIGIN:'https://bigbigbai.github.io',COLLECTION_ENABLED:'true',IP_LIMITER:allowed,GLOBAL_LIMITER:allowed});

test('real SQL deduplicates page heartbeats and clicks; out-of-order heartbeats cannot lower time or scroll',async t => {
  const {sql,db} = database(t); const env = envFor(db); const e = event();
  assert.equal((await worker.fetch(request([e]),env)).status,204);
  assert.equal((await worker.fetch(request([{...e,active_ms:4500,scroll_pct:90}]),env)).status,204);
  const click = {...e,type:'action',event_id:id(),action:'link',value:'paper_pdf'};
  assert.equal((await worker.fetch(request([e,click,click]),env)).status,204);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events').get().n,2);
  const stored = sql.prepare("SELECT * FROM events WHERE type='page'").get();
  assert.equal(stored.active_ms,4500); assert.equal(stored.scroll_pct,90);
  assert.equal(stored.referrer,'example.com');
  assert.ok(!JSON.stringify(stored).includes('secret'));
  assert.ok(!Object.keys(stored).some(k => /ip|agent/.test(k)));
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE type='action'").get().n,1);
  // A collision cannot alter a page owned by a different session/browser.
  await worker.fetch(request([{...e,session_id:id(),active_ms:999999}]),env);
  assert.equal(sql.prepare("SELECT active_ms FROM events WHERE type='page'").get().active_ms,4500);
});

test('collector restricts origins, reads, content types, batch size, rate limits and disabled collection',async t => {
  const {db,sql} = database(t); const env = envFor(db); const e = event();
  assert.equal((await worker.fetch(request([e],{headers:{Origin:'https://other.example'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://analytics.example/collect',{headers:{Origin:env.ALLOWED_ORIGIN}}),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://analytics.example/admin'),env)).status,404);
  const preflight = await worker.fetch(new Request('https://analytics.example/collect',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGIN}}),env);
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('access-control-allow-origin'),env.ALLOWED_ORIGIN);
  assert.equal((await worker.fetch(request([e]),{...env,COLLECTION_ENABLED:'false'})).status,503);
  assert.equal((await worker.fetch(request([e]),{...env,IP_LIMITER:{limit:async()=>({success:false})}})).status,429);
  assert.equal((await worker.fetch(request([e]),{...env,GLOBAL_LIMITER:undefined})).status,503);
  assert.equal((await worker.fetch(request([e],{headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'text/html'}}),env)).status,415);
  assert.equal((await worker.fetch(request(Array(21).fill(e)),env)).status,400);
  assert.equal((await worker.fetch(request([e],{body:'x'.repeat(32769)}),env)).status,400);
  assert.equal((await worker.fetch(request([{...e,type:'action',action:'search',value:'secret search text'}]),env)).status,400);
  assert.equal((await worker.fetch(request([e,{...e,event_id:'invalid'}]),env)).status,400);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events').get().n,0);
  assert.equal((await worker.fetch(request([e]),{...env,DB:{...db,batch:async()=>{throw Error('unavailable');}}})).status,503);
});

test('normalization strips unknown data, bounds values, rejects stale and malformed events',() => {
  const e = event({active_ms:1e12,scroll_pct:999,search:'sensitive',url:'https://secret',utm_source:'x'.repeat(200)});
  const r = request([e]); Object.defineProperty(r,'cf',{value:{country:'CA'}});
  const n = normalizeEvent(e,r,now);
  assert.equal(n.active_ms,10000); assert.equal(n.scroll_pct,100); assert.equal(n.country,'CA'); assert.equal(n.utm_source.length,128);
  assert.equal(n.search,undefined); assert.equal(n.url,undefined);
  assert.throws(()=>normalizeEvent({...e,occurred_at:now-86400001},r,now));
  assert.throws(()=>normalizeEvent({...e,visitor_id:'bad'},r,now));
  assert.throws(()=>normalizeEvent({...e,page:'arbitrary private URL'},r,now));
});

test('daily retention keeps long-term aggregates while deleting detail older than 90 UTC days; reruns are idempotent',async t => {
  const {sql,db} = database(t);
  const today = Math.floor(now/86400000)*86400000;
  for (const [age,owner] of [[91,0],[89,0],[1,0],[1,1]]) {
    const at = today-age*86400000+1000;
    const raw = event({occurred_at:at,is_owner:owner});
    const n = normalizeEvent(raw,request([raw]),at+10000);
    await db.batch([eventStatement(db,n),eventStatement(db,{...n,type:'action',event_id:id(),action:'link',value:'paper_pdf',active_ms:0,scroll_pct:0})]);
  }
  await db.batch(retentionStatements(db,now));
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events').get().n,6);
  assert.equal(sql.prepare('SELECT SUM(pageviews) n FROM daily_totals').get().n,4);
  assert.equal(sql.prepare('SELECT SUM(count) n FROM daily_actions').get().n,4);
  assert.equal(sql.prepare('SELECT SUM(pageviews) n FROM daily_totals WHERE is_owner=0').get().n,3);
  await db.batch(retentionStatements(db,now));
  assert.equal(sql.prepare('SELECT SUM(pageviews) n FROM daily_totals').get().n,4);
  assert.equal(sql.prepare('SELECT SUM(count) n FROM daily_actions').get().n,4);
});

function fakeBrowser() {
  const memory = () => { const m = new Map(); return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}; };
  let time = now; const sends = [], handlers = {}, timers = [];
  const win = {
    location:new URL('https://bigbigbai.github.io/sre-marathon-leaderboard/?utm_source=paper&secret=private'),
    document:{visibilityState:'visible',referrer:'https://source.example/private?secret=yes',documentElement:{scrollHeight:2000},addEventListener:(n,f)=>handlers['doc:'+n]=f},
    localStorage:memory(),sessionStorage:memory(),crypto,Date:{now:()=>time},Blob,
    navigator:{sendBeacon:(_url,body)=>{sends.push(body);return true;}},
    fetch:async(_url,init)=>{sends.push(init.body);return {ok:true,status:204};},
    innerHeight:1000,scrollY:0,
    addEventListener:(n,f)=>handlers[n]=f,setInterval:f=>{timers.push(f);},
  };
  return {win,sends,handlers,timers,advance:n=>time+=n,events:async()=> (await Promise.all(sends.map(async s=>JSON.parse(typeof s==='string'?s:await s.text()).events))).flat()};
}
const options = {endpoint:'https://analytics.example/collect',siteUrl:'https://bigbigbai.github.io/sre-marathon-leaderboard/'};

test('browser tracks virtual pages once, foreground time only, sanitized attribution and session renewal',async()=>{
  const f = fakeBrowser(); const a = createAnalytics(options,f.win);
  a.page('home'); a.page('home');
  await Promise.resolve();
  f.advance(10000); f.win.document.visibilityState='hidden'; f.handlers['doc:visibilitychange']();
  f.advance(3600000); f.timers[0]();
  let es = await f.events();
  assert.equal(new Set(es.filter(e=>e.type==='page').map(e=>e.event_id)).size,1);
  assert.equal(Math.max(...es.map(e=>e.active_ms||0)),10000);
  f.win.document.visibilityState='visible'; f.handlers['doc:visibilitychange']();
  f.advance(5000); a.action('search','used'); a.page('application/train-ticket');
  await Promise.resolve(); f.handlers.pagehide();
  es = await f.events();
  const pages = [...new Map(es.filter(e=>e.type==='page').map(e=>[e.event_id,e])).values()];
  assert.equal(pages.length,3);
  assert.notEqual(pages[0].session_id,pages[1].session_id);
  assert.equal(pages[0].is_returning,0); assert.equal(pages[1].is_returning,1);
  assert.equal(pages[2].page,'application/train-ticket');
  assert.ok(!JSON.stringify(es).includes('private')); assert.ok(!JSON.stringify(es).includes('secret'));
  assert.equal(es[0].referrer,'https://source.example');
});

test('collection is off for previews, missing config, browser privacy signals and opt-out; storage denial still works',async()=>{
  for (const mutate of [f=>f.win.location=new URL('http://localhost:5173/'),f=>f.win.navigator.doNotTrack='1',f=>f.win.navigator.globalPrivacyControl=true,f=>f.win.localStorage.setItem('sre-marathon.analytics.disabled','1')]) {
    const f=fakeBrowser();mutate(f);createAnalytics(options,f.win).page('home');assert.equal(f.sends.length,0);assert.equal(f.timers.length,0);
  }
  const disabled=fakeBrowser();createAnalytics({},disabled.win).page('home');assert.equal(disabled.sends.length,0);
  const f=fakeBrowser();f.win.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const a=createAnalytics(options,f.win);a.page('home');await Promise.resolve();
  assert.equal((await f.events())[0].visitor_id,null);
  assert.equal((await f.events())[0].is_returning,null);
});

test('owner classification, cross-tab opt-out, and retry preserve event identity',async()=>{
  const f=fakeBrowser();f.win.localStorage.setItem('sre-marathon.analytics.owner','1');
  f.win.fetch=async(_u,init)=>{f.sends.push(init.body);return {ok:false,status:503};};
  const a=createAnalytics(options,f.win);a.page('home');await Promise.resolve();await Promise.resolve();
  f.advance(30000);f.timers[0]();await Promise.resolve();
  const es=await f.events();assert.ok(es.length>=2);assert.equal(es[0].event_id,es[1].event_id);assert.equal(es[0].is_owner,1);
  f.handlers.storage({key:'sre-marathon.analytics.disabled'});
  const count=f.sends.length;a.action('link','paper_pdf');f.timers[0]();f.handlers.pagehide();
  assert.equal(f.sends.length,count);
});
