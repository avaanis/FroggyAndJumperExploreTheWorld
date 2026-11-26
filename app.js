const $=s=>document.querySelector(s);
const HASH='b68823eded0bc9c7f3317d601ac24f6ac563895cee8e5a2bd2ca475906fe2615';
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const cfg=window.FB_CONFIG||{},live=!!cfg.apiKey;let db;
if(live){firebase.initializeApp(cfg);db=firebase.database();}

/* storage: Firebase when configured, otherwise this browser only */
const L=JSON.parse(localStorage.fjdata||'{}'),subs=[];
const get=(o,p)=>p.split('/').reduce((a,k)=>a&&a[k],o)??null;
const store={
 on(p,cb){if(live)db.ref(p).on('value',s=>cb(s.val()));else{subs.push([p,cb]);cb(get(L,p));}},
 set(p,v){if(live)return db.ref(p).set(v);const k=p.split('/');let o=L;k.slice(0,-1).forEach(x=>o=o[x]=o[x]||{});v===null?delete o[k.at(-1)]:o[k.at(-1)]=v;localStorage.fjdata=JSON.stringify(L);subs.forEach(([q,cb])=>cb(get(L,q)));}
};

/* gate */
let who=localStorage.fjwho;
const enter=()=>{$('#gate').hidden=true;$('#app').hidden=false;start();};
const askWho=()=>{$('#pw').hidden=true;$('#who').hidden=false;};
$('#pw').onsubmit=async e=>{e.preventDefault();
 if(await sha($('#pwin').value.trim().toLowerCase())===HASH){sessionStorage.fjok=1;who?enter():askWho();}
 else $('#pwerr').textContent='That is not the password.';};
document.querySelectorAll('#who button').forEach(b=>b.onclick=()=>{who=b.dataset.w;localStorage.fjwho=who;enter();});
if(sessionStorage.fjok&&who)enter();

/* theme */
const setTheme=t=>{document.documentElement.dataset.theme=t;localStorage.fjtheme=t;$('#theme').textContent=t=='dark'?'Light':'Dark';};
setTheme(localStorage.fjtheme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme=='dark'?'light':'dark');

function start(){
 const paper=$('#paper'),cid='u'+Math.random().toString(36).slice(2,9);
 let tabs=null,cur=null,comments={},people={},dirty=false,timer,seeded=false;
 const status=t=>$('#status').textContent=t;
 const sorted=()=>Object.entries(tabs||{}).sort((a,b)=>a[1].o-b[1].o);

 /* toolbar */
 const fonts=['DM Sans','Lora','Marcellus','Playfair Display','Space Mono','Caveat'];
 $('#m-font').innerHTML=fonts.map(f=>`<button data-f="${f}" style="font-family:'${f}'">${f}</button>`).join('');
 $('#m-style').innerHTML=[['p','Normal text'],['h2','Heading'],['h1','Title']].map(s=>`<button data-s="${s[0]}">${s[1]}</button>`).join('');
 $('#m-color').innerHTML=['#2b2540','#7a6fc2','#e0405a','#d9822b','#3f8f6b','#2f6fb0','#8a8a8a','#f3effa'].map(c=>`<button data-fc="${c}" style="background:${c}"></button>`).join('');
 $('#m-hi').innerHTML=['#ffe9a8','#f9c6e0','#cfc8f5','#c8ecd9','#bfe0f5','transparent'].map(c=>`<button data-hc="${c}" style="background:${c}"></button>`).join('');
 const closeMenus=()=>document.querySelectorAll('.menu').forEach(m=>m.classList.remove('open'));
 const run=(c,v)=>{paper.focus();document.execCommand(c,false,v);paper.dispatchEvent(new Event('input'));};
 $('#bar').onmousedown=e=>{if(!e.target.closest('textarea'))e.preventDefault();};
 $('#bar').onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.dd){const m=$('#'+d.dd),o=m.classList.contains('open');closeMenus();m.classList.toggle('open',!o);return;}
  closeMenus();
  if(d.c)run(d.c);if(d.f)run('fontName',d.f);if(d.s)run('formatBlock',d.s);
  if(d.fc)run('foreColor',d.fc);if(d.hc)run('hiliteColor',d.hc);};

 /* tabs */
 function renderTabs(){$('#tl').innerHTML='';sorted().forEach(([id,t])=>{
  const li=document.createElement('li');li.draggable=true;li.className=id==cur?'on':'';li.dataset.id=id;
  const here=Object.values(people).some(p=>p.tab==id);
  li.innerHTML=`<span>${esc(t.title)}</span>${here?'<i title="Someone is here"></i>':''}<button class="x">×</button>`;
  li.onclick=e=>{if(e.target.className=='x'){if(sorted().length>1&&confirm('Delete this tab for both of you?')){store.set('tabs/'+id,null);store.set('comments/'+id,null);}return;}open(id);};
  li.ondblclick=()=>{const n=prompt('Rename tab',t.title);if(n)store.set(`tabs/${id}/title`,n);};
  li.ondragstart=e=>e.dataTransfer.setData('t',id);li.ondragover=e=>e.preventDefault();
  li.ondrop=e=>{e.preventDefault();const f=e.dataTransfer.getData('t');if(f==id)return;
   const ids=sorted().map(x=>x[0]).filter(x=>x!=f);ids.splice(ids.indexOf(id),0,f);ids.forEach((x,i)=>store.set(`tabs/${x}/o`,i));};
  $('#tl').appendChild(li);});}
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function open(id){if(dirty)save();cur=id;paper.innerHTML=tabs[id].html||'';renderTabs();renderComments();beat();}
 $('#addt').onclick=()=>{const id='t'+Date.now().toString(36);
  store.set('tabs/'+id,{title:'New tab',o:sorted().length+Date.now()%1000,html:'<h1>New tab</h1><p><br></p>'});setTimeout(()=>tabs[id]&&open(id),400);};

 store.on('tabs',v=>{
  if(!v&&!seeded){seeded=true;[['Travel','Places we want to see together'],['Food','Dishes and restaurants to try'],['Date ideas','Small adventures nearby']].forEach((t,i)=>
   store.set('tabs/s'+i,{title:t[0],o:i,html:`<h1>${t[0]}</h1><p>${t[1]}</p><ul><li><br></li></ul>`}));return;}
  tabs=v||{};if(!tabs[cur])cur=sorted()[0]?.[0];
  if(cur&&!paper.dataset.ready){paper.dataset.ready=1;paper.innerHTML=tabs[cur].html||'';}
  else if(cur&&!dirty&&paper.innerHTML!==tabs[cur].html)applyRemote(tabs[cur].html);
  renderTabs();});

 /* caret-safe remote update */
 function applyRemote(html){const s=getSelection();let off=null;
  if(s.rangeCount&&paper.contains(s.anchorNode)){const r=document.createRange();r.selectNodeContents(paper);r.setEnd(s.anchorNode,s.anchorOffset);off=r.toString().length;}
  paper.innerHTML=html;renderComments();
  if(off!==null){const w=document.createTreeWalker(paper,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(off<=n.length){s.collapse(n,off);return;}off-=n.length;}}}

 /* autosave */
 function save(){clearTimeout(timer);if(!cur)return;dirty=false;store.set(`tabs/${cur}/html`,paper.innerHTML);status('Saved');}
 paper.addEventListener('input',()=>{dirty=true;status('Saving…');clearTimeout(timer);timer=setTimeout(save,500);beat(true);});
 addEventListener('beforeunload',()=>dirty&&save());

 /* comments */
 $('#addc').onclick=()=>{const s=getSelection();if(!s.rangeCount||s.isCollapsed||!paper.contains(s.anchorNode)){alert('Select some text first.');return;}
  window.savedRange=s.getRangeAt(0).cloneRange();$('#cbox').hidden=false;$('#ctext').focus();};
 $('#cpost').onclick=()=>{const t=$('#ctext').value.trim(),r=window.savedRange;if(!t||!r)return;
  const id='c'+Date.now().toString(36),sp=document.createElement('span');sp.className='cm';sp.dataset.c=id;
  try{r.surroundContents(sp);}catch(e){sp.appendChild(r.extractContents());r.insertNode(sp);}
  store.set(`comments/${cur}/${id}`,{by:who,text:t,at:Date.now()});$('#ctext').value='';$('#cbox').hidden=true;save();};
 store.on('comments',v=>{comments=v||{};renderComments();});
 function renderComments(){const box=$('#cl');box.innerHTML='';
  Object.entries(comments[cur]||{}).forEach(([id,c])=>{if(!paper.querySelector(`[data-c="${id}"]`))return;
   const d=document.createElement('div');d.className='card';d.innerHTML=`<b>${esc(c.by)}</b><br>${esc(c.text)}<br><button>Resolve</button>`;
   d.onclick=e=>{const sp=paper.querySelector(`[data-c="${id}"]`);
    if(e.target.tagName=='BUTTON'){sp.replaceWith(...sp.childNodes);store.set(`comments/${cur}/${id}`,null);save();return;}
    sp.scrollIntoView({block:'center',behavior:'smooth'});sp.classList.add('fl');setTimeout(()=>sp.classList.remove('fl'),1200);};
   box.appendChild(d);});}

 /* presence */
 let ty=0;const me=()=>({name:who,tab:cur,t:Date.now(),ty});
 function beat(typing){if(typing)ty=Date.now();if(!live)return;db.ref('presence/'+cid).set(me());}
 if(live){db.ref('presence/'+cid).onDisconnect().remove();setInterval(()=>beat(),15000);}
 store.on('presence',v=>{people={};Object.entries(v||{}).forEach(([k,p])=>{if(k!=cid&&Date.now()-p.t<45000)people[k]=p;});showHere();});
 function showHere(){const ps=Object.values(people);
  $('#here').textContent=!live?'Test mode: saved on this device only (add Firebase to share)':
   ps.length?ps.map(p=>`${p.name} is ${Date.now()-p.ty<4000?'editing':'here'}${tabs?.[p.tab]?' in '+tabs[p.tab].title:''}`).join(' · '):'Only you are here';
  renderTabs();}
 setInterval(showHere,3000);
 document.addEventListener('click',e=>{if(!e.target.closest('.dd'))closeMenus();});
}
