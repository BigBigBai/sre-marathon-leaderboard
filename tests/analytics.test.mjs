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
  for (const file of fs.readdirSync(new URL('../analytics/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) {
    sql.exec(fs.readFileSync(new URL(`../analytics/migrations/${file}`,import.meta.url),'utf8'));
  }
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
  assert.equal(stored.ip,'192.0.2.1');
  assert.equal(stored.region,null); assert.equal(stored.city,null);
  assert.ok(!Object.keys(stored).some(k => /agent/i.test(k)));
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

test('report migration preserves pre-upgrade events and accepts older collectors without fabricated path metadata',async t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(fs.readFileSync(new URL('../analytics/migrations/0001_initial.sql',import.meta.url),'utf8'));
  const old=normalizeEvent(event(),request([]),now);delete old.page_sequence;delete old.previous_page;delete old.ip;delete old.region;delete old.city;
  const columns=Object.keys(old);
  sql.prepare(`INSERT INTO events (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(old));
  const before=sql.prepare('SELECT * FROM events').get();
  sql.exec(fs.readFileSync(new URL('../analytics/migrations/0002_reports_and_paths.sql',import.meta.url),'utf8'));
  const after=sql.prepare('SELECT * FROM events').get();
  for(const key of columns)assert.equal(after[key],before[key],key);
  assert.equal(after.page_sequence,null);assert.equal(after.previous_page,null);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM other_visits').get().n,1);
  assert.equal(sql.prepare('SELECT sequence_ordered FROM session_paths').get().sequence_ordered,0);
  const {db}=database(t);
  assert.equal((await worker.fetch(request([event()]),envFor(db))).status,204);
  for(const fields of [{page_sequence:0},{page_sequence:1.5},{page_sequence:1000001},{page_sequence:'2'},{previous_page:'https://secret.example/?token=private'}]) {
    assert.equal((await worker.fetch(request([event(fields)]),envFor(db))).status,400);
  }
});

test('reports separate owner activity, exclude unknown browser IDs from profiles and deduplicate resource interest',async t=>{
  const {sql,db}=database(t);const visitor=id(),session=id();
  const first=event({visitor_id:visitor,session_id:session,page_sequence:1});
  const second=event({visitor_id:visitor,session_id:session,page:'application/train-ticket',page_sequence:2,previous_page:'home'});
  const owner=event({visitor_id:visitor,session_id:session,is_owner:1,page_sequence:1});
  const anonymous=event({visitor_id:null,page_sequence:1});
  const click={...first,event_id:id(),type:'action',action:'link',value:'paper_pdf'};
  const anonClick={...anonymous,event_id:id(),type:'action',action:'link',value:'paper_pdf'};
  for(const e of [first,second,owner,anonymous,click,click,anonClick])await db.batch([eventStatement(db,normalizeEvent(e,request([e]),now))]);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM owner_visits').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM other_visits').get().n,3);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM visitor_profiles').get().n,2);
  const profile=sql.prepare('SELECT * FROM visitor_profiles WHERE is_owner=0').get();
  assert.equal(profile.pageviews,2);assert.equal(profile.sessions,1);assert.equal(profile.active_ms,6000);
  const normal=sql.prepare('SELECT * FROM session_summary WHERE visitor_id=? AND is_owner=0').get(visitor);
  assert.equal(normal.pageviews,2);assert.equal(normal.distinct_pages,2);assert.equal(normal.actions,1);assert.equal(normal.resource_clicks,1);
  const anon=sql.prepare('SELECT * FROM session_summary WHERE visitor_id IS NULL').get();
  assert.equal(anon.actions,1);assert.equal(anon.is_returning,0);
  const resource=sql.prepare('SELECT * FROM resource_interest WHERE is_owner=0').get();
  assert.equal(resource.clicks,2);assert.equal(resource.known_browsers,1);assert.equal(resource.sessions,2);
  sql.exec(fs.readFileSync(new URL('../analytics/queries.sql',import.meta.url),'utf8'));
});

test('paths use valid sequence order for time ties and clock changes, with explicit fallback for legacy or duplicate sequence metadata',async t=>{
  const {sql,db}=database(t);const session=id(),visitor=id();
  const first=event({session_id:session,visitor_id:visitor,page_sequence:1,occurred_at:now-1000});
  const second=event({session_id:session,visitor_id:visitor,page_sequence:2,previous_page:'home',page:'application/astronomy-shop',occurred_at:now-2000});
  for(const e of [second,first,second])await db.batch([eventStatement(db,normalizeEvent(e,request([e]),now))]);
  let paths=sql.prepare('SELECT * FROM session_paths ORDER BY step').all();
  assert.deepEqual(paths.map(p=>p.page_sequence),[1,2]);assert.ok(paths.every(p=>p.sequence_ordered===1));
  const legacy=event({session_id:session,visitor_id:visitor,occurred_at:now-4000});
  await db.batch([eventStatement(db,normalizeEvent(legacy,request([legacy]),now))]);
  paths=sql.prepare('SELECT * FROM session_paths ORDER BY step').all();
  assert.equal(paths[0].page_id,legacy.page_id);assert.ok(paths.every(p=>p.sequence_ordered===0));
  sql.prepare('DELETE FROM events WHERE event_id=?').run(legacy.event_id);
  const duplicate=event({session_id:session,visitor_id:visitor,page_sequence:2,occurred_at:now-3000});
  await db.batch([eventStatement(db,normalizeEvent(duplicate,request([duplicate]),now))]);
  assert.equal(sql.prepare('SELECT MAX(sequence_ordered) n FROM session_paths').get().n,0);
});

test('resource conversion uses eligible browser-session pairs and matching pages, excluding owners, stale and orphan clicks',async t=>{
  const {sql,db}=database(t);
  const first=event(),other=event({visitor_id:null}),owner=event({is_owner:1});
  const old=event({occurred_at:now-31*86400000});
  const normalClick={...first,type:'action',event_id:id(),action:'link',value:'paper_pdf'};
  const anonClick={...other,type:'action',event_id:id(),action:'link',value:'paper_pdf'};
  const ownerClick={...owner,type:'action',event_id:id(),action:'link',value:'paper_pdf'};
  const oldPageClick={...old,type:'action',event_id:id(),occurred_at:now-1000,action:'link',value:'benchmark_code'};
  const orphanClick=event({type:'action',action:'link',value:'paper_pdf'});
  const mismatch={...normalClick,event_id:id(),visitor_id:id(),value:'benchmark_code'};
  for(const e of [first,other,owner,old,normalClick,normalClick,anonClick,ownerClick,oldPageClick,orphanClick,mismatch]) {
    await db.batch([eventStatement(db,normalizeEvent(e,request([e]),e===old?old.occurred_at+10000:now))]);
  }
  const text=fs.readFileSync(new URL('../analytics/queries.sql',import.meta.url),'utf8');
  const query=text.match(/WITH eligible_pages AS[\s\S]*?;/)[0];
  const results=sql.prepare(query).all();
  const paper=results.find(r=>r.resource==='paper_pdf');assert.equal(paper.eligible_sessions,2);assert.equal(paper.clicked_sessions,2);assert.equal(paper.session_click_pct,100);
  const code=results.find(r=>r.resource==='benchmark_code');assert.equal(code.clicked_sessions,0);assert.equal(code.session_click_pct,0);
  sql.exec('DELETE FROM events');
  assert.ok(sql.prepare(query).all().every(r=>r.eligible_sessions===0&&r.clicked_sessions===0&&r.session_click_pct===null));
});

test('page sequences persist across virtual routes and reloads; BFCache restore reads the latest tracked predecessor',async()=>{
  const f=fakeBrowser(),a=createAnalytics(options,f.win);a.page('home');await Promise.resolve();
  f.handlers.pageshow({persisted:false});a.page('home');
  a.page('application/astronomy-shop');a.page('application/astronomy-shop');await Promise.resolve();
  f.handlers.pagehide();
  const second=fakeBrowser();second.win.localStorage=f.win.localStorage;second.win.sessionStorage=f.win.sessionStorage;second.advance(1000);
  const b=createAnalytics(options,second.win);b.page('application/train-ticket');await Promise.resolve();second.handlers.pagehide();
  // Restored first document must see the other document's session sequence.
  f.advance(2000);f.handlers.pageshow({persisted:true});await Promise.resolve();f.handlers.pagehide();
  const es=[...await f.events(),...await second.events()];
  const pages=[...new Map(es.filter(e=>e.type==='page').map(e=>[e.event_id,e])).values()].sort((x,y)=>x.page_sequence-y.page_sequence);
  assert.deepEqual(pages.map(p=>p.page_sequence),[1,2,3,4]);
  assert.deepEqual(pages.map(p=>p.previous_page),[null,'home','application/astronomy-shop','application/train-ticket']);
  assert.deepEqual(pages.map(p=>p.page),['home','application/astronomy-shop','application/train-ticket','application/astronomy-shop']);
  assert.equal(new Set(pages.map(p=>p.session_id)).size,1);
});

test('idle BFCache restoration starts a new session and resets sequence without counting the hidden interval',async()=>{
  const f=fakeBrowser(),a=createAnalytics(options,f.win);a.page('home');await Promise.resolve();
  f.advance(3000);f.handlers.pagehide({persisted:true});f.win.document.visibilityState='hidden';f.handlers['doc:visibilitychange']();f.advance(1800000);
  // Chrome emits visibilitychange(visible) before pageshow(persisted).
  f.win.document.visibilityState='visible';f.handlers['doc:visibilitychange']();f.timers[0]();
  f.handlers.pageshow({persisted:true});await Promise.resolve();f.handlers.pagehide();
  const pages=[...new Map((await f.events()).filter(e=>e.type==='page').map(e=>[e.event_id,e])).values()];
  assert.equal(pages.length,2);assert.notEqual(pages[0].session_id,pages[1].session_id);
  assert.equal(pages[1].page_sequence,1);assert.equal(pages[1].previous_page,null);assert.equal(pages[0].active_ms,3000);assert.equal(pages[1].active_ms,0);
});

test('BFCache restore respects privacy changes even when the frozen document missed storage events',async()=>{
  for(const [key,value] of [['disabled','1'],['owner','1']]){
    const f=fakeBrowser(),a=createAnalytics(options,f.win);a.page('home');await Promise.resolve();f.handlers.pagehide();
    f.win.localStorage.setItem('sre-marathon.analytics.'+key,value);const count=f.sends.length;
    f.handlers.pageshow({persisted:true});a.action('link','paper_pdf');f.timers[0]();
    assert.equal(f.sends.length,count);
  }
});

test('network metadata uses Cloudflare connection fields, ignores payload/forwarded spoofing and preserves initial snapshot',async t=>{
  const {sql,db}=database(t);const env=envFor(db);
  const e=event({ip:'203.0.113.99',country:'US',region:'Spoofed',city:'Spoofed'});
  const r=request([e]);r.headers.set('X-Forwarded-For','203.0.113.99');
  Object.defineProperty(r,'cf',{value:{country:'CA',region:'Ontario',city:'Toronto'}});
  assert.equal((await worker.fetch(r,env)).status,204);
  let row=sql.prepare('SELECT * FROM events').get();
  assert.equal(row.ip,'192.0.2.1');assert.equal(row.country,'CA');assert.equal(row.region,'Ontario');assert.equal(row.city,'Toronto');
  const heartbeat=request([{...e,active_ms:4500,scroll_pct:90}]);heartbeat.headers.set('cf-connecting-ip','2001:db8::1');
  Object.defineProperty(heartbeat,'cf',{value:{country:'US',region:'California',city:'Los Angeles'}});
  assert.equal((await worker.fetch(heartbeat,env)).status,204);
  row=sql.prepare('SELECT * FROM events').get();
  assert.equal(row.ip,'192.0.2.1');assert.equal(row.region,'Ontario');assert.equal(row.city,'Toronto');assert.equal(row.active_ms,4500);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM other_visits').get().n,1);
  assert.equal(sql.prepare('SELECT ip FROM other_visits').get().ip,'192.0.2.1');
});

test('IPv4 and IPv6 are accepted, invalid/missing IPs stay null and location text is bounded',()=>{
  const e=event();
  for(const ip of ['192.0.2.1','2001:db8::1','::ffff:192.0.2.1']){
    const r=request([e]);r.headers.set('cf-connecting-ip',ip);assert.equal(normalizeEvent(e,r,now).ip,ip);
  }
  for(const ip of ['invalid','999.1.2.3','::invalid','192.0.2.1, 203.0.113.1','[::1]:443']){
    const r=request([e]);r.headers.set('cf-connecting-ip',ip);assert.equal(normalizeEvent(e,r,now).ip,null);
  }
  const r=request([e]);r.headers.delete('cf-connecting-ip');r.headers.set('X-Forwarded-For','203.0.113.1');
  Object.defineProperty(r,'cf',{value:{region:'  '+ 'x'.repeat(200),city:'\u0000  '}});
  const n=normalizeEvent(e,r,now);assert.equal(n.ip,null);assert.equal(n.region.length,128);assert.equal(n.city,null);
});

test('network migration leaves historical fields null through later heartbeats and retention removes network detail',async t=>{
  const {sql,db}=database(t);const e=event();
  // Reproduce an event inserted by the pre-upgrade Worker, without the new columns.
  const old=normalizeEvent(e,request([e]),now);delete old.ip;delete old.region;delete old.city;
  await db.batch([eventStatement(db,old)]);
  const r=request([{...e,active_ms:4500}]);Object.defineProperty(r,'cf',{value:{country:'CA',region:'Ontario',city:'Toronto'}});
  assert.equal((await worker.fetch(r,envFor(db))).status,204);
  const row=sql.prepare('SELECT ip,region,city FROM events WHERE event_id=?').get(e.event_id);
  assert.deepEqual({...row},{ip:null,region:null,city:null});
  const at=Math.floor(now/86400000)*86400000-91*86400000+1000;
  const expired=event({occurred_at:at});await db.batch([eventStatement(db,normalizeEvent(expired,request([expired]),at+10000))]);
  await db.batch(retentionStatements(db,now));
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events WHERE event_id=?').get(expired.event_id).n,0);
  assert.ok(!sql.prepare('PRAGMA table_info(daily_totals)').all().some(c=>['ip','region','city'].includes(c.name)));
});
