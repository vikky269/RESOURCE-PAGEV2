'use strict';
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const categories = [
 {id:'all',label:'All resources',icon:'spark'},
 {id:'internships',label:'Internships',icon:'case'},
 {id:'college-applications',label:'College applications',icon:'cap'},
 {id:'scholarship-applications',label:'Scholarships',icon:'spark'},
 {id:'jobs',label:'Jobs',icon:'case'},
 {id:'competitions',label:'Competitions',icon:'spark'},
 {id:'conferences',label:'Conferences & events',icon:'globe'}
];
const labelFor = id => categories.find(c => c.id === id)?.label || id;
function stored(key,fallback){try {return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}}
function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const savedRaw = stored('smartmathz-saved-v1',[]);
const saved = new Set(Array.isArray(savedRaw) ? savedRaw.filter(v=>typeof v==='string') : []);
let data = [], category='all', query='', region='local', includeExpired=false, availability='all', savedOnly=false, limit=6, sort='recommended', activeId=null, plan='college';
const requestedQuery = new URLSearchParams(location.search).get('q');
if(requestedQuery){query=requestedQuery.slice(0,120);$('#search').value=query;}
let tasksDone = stored('smartmathz-plan-v1',{});
if(!tasksDone || typeof tasksDone!=='object' || Array.isArray(tasksDone)) tasksDone={};
const plans={
 college:{category:'college-applications',label:'college',tasks:[['Make your college shortlist','Explore courses, locations and entry requirements.'],['Map your application deadlines','Include your school’s internal deadlines, too.'],['Start your story','List your activities and ideas for your application.']]},
 internships:{category:'internships',label:'internship',tasks:[['Find a field that sparks your curiosity','Explore projects and roles that match your interests.'],['Check that you’re eligible','Look at age, enrollment and location requirements.'],['Get your application ready','Gather your experience, projects and school details.']]},
 jobs:{category:'jobs',label:'job',tasks:[['Choose a starting point','Think about your interests and transferable skills.'],['Give your résumé a refresh','Show your projects, experience and achievements.'],['Find a role and take the first step','Read the requirements and tailor your application.']]}
};
function dayNumber(d){return Math.floor(new Date(d+'T00:00:00Z').getTime()/86400000);}
function currentDay(){return dayNumber(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));}
function isExpired(r){return r.status==='closed'||(r.deadlineAt&&Date.parse(r.deadlineAt)<Date.now())||!!r.deadlineDate&&dayNumber(r.deadlineDate)<currentDay()||r.deadlineKind==='event'&&r.eventDate&&dayNumber(r.eventDate)<currentDay();}
function upcoming(r){return r.opensOn?dayNumber(r.opensOn)>currentDay():r.status==='upcoming';}
function regionMatches(r){return region==='all'||region==='local'&&['NY','MD'].includes(r.region)||region===r.region;}
function availabilityMatches(r){return availability==='all'||availability==='upcoming'&&upcoming(r)||availability==='open'&&!upcoming(r)&&r.status!=='watch'&&!isExpired(r)||availability==='watch'&&r.status==='watch';}
function place(r){return r.location||(r.region==='NY'?'New York':r.region==='MD'?'Maryland':r.region==='National'?'U.S. nationwide':r.region);}
function checked(r){return r.lastVerifiedAt?new Date(r.lastVerifiedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'America/New_York'}):'Not yet verified';}
function applicationStatus(r){return isExpired(r)?'Closed':upcoming(r)?'Upcoming':r.status==='watch'?'Watch for updates':r.deadlineKind==='varies'?'Application guide':r.deadlineKind==='event'?'Event calendar':'Open';}
function formattedDate(d,year=true){return new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'});}
function deadlineText(r){
 if(r.deadlineKind==='event')return r.eventDate?'Events through '+formattedDate(r.eventDate):'See event calendar';
 if(!r.deadlineDate)return r.deadlineKind==='rolling'?'Rolling applications':r.deadlineKind==='varies'?'Deadlines vary':'Deadline not published';
 const prefix=isExpired(r)?'Closed · ':r.deadlineKind==='nomination'?'School deadline: ':r.deadlineKind==='registration'?'Register by ':r.deadlineKind==='promotion'?'Fee window ends ':'Due ';
 return prefix+formattedDate(r.deadlineDate);
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function visual(r){
 let cls='visual-intern', inner=esc(r.provider), lab='EXPERIENCE STARTS HERE';
 if(r.provider==='NASA'){cls='visual-nasa';inner='<span class="nasa-orbit"></span><span class="nasa-word">NASA</span>';lab='A WORLD BEYOND THE ORDINARY';}
 else if(r.provider==='Common App'){cls='visual-common';inner='<span class="provider-word"><span class="common-mark"></span>common app</span>';lab='YOUR STORY. YOUR NEXT CHAPTER.';}
 else if(r.provider==='Handshake'){cls='visual-handshake';inner='<span class="provider-word">Handshake<span style="font-size:19px">✳</span></span>';lab='LET’S GET YOU STARTED';}
 else if(r.provider==='UCAS'){cls='visual-ucas';inner='<span class="provider-word">UCAS<span style="font-size:27px">↗</span></span>';lab='FIND YOUR PLACE';}
 else {
  if(r.category==='scholarship-applications'){cls='visual-scholar';lab='A LITTLE SUPPORT. A BIG DIFFERENCE.';inner=icon('spark');}
  else if(r.category==='competitions'){cls='visual-competition';lab='GIVE YOUR IDEAS A STAGE';inner=icon('spark');}
  else if(r.category==='conferences'){cls='visual-conference';lab='MEET MINDS LIKE YOURS';inner=icon('globe');}
  else inner=`<span class="provider-word">${esc(r.provider)}</span>`;
  if(r.category==='scholarship-applications') inner=`<span class="provider-word" style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:32px;letter-spacing:-1px">Make room<br>for possibility.</span>`;
  if(r.category==='competitions') inner=`<span class="provider-word" style="font-size:30px">Ideas into<br>impact. ${icon('spark')}</span>`;
  if(r.category==='conferences') inner=`<span class="provider-word" style="font-size:30px">Connect.<br>Get inspired.</span>`;
 }
 return `<div class="card-visual ${cls}">${inner}<span class="visual-label">${lab}</span></div>`;
}
function card(r,i){
 const savedState=saved.has(r.id),status=applicationStatus(r),soon=r.deadlineDate&&!isExpired(r)&&dayNumber(r.deadlineDate)-currentDay()<=7;
 const stateClass=isExpired(r)?'closed':upcoming(r)?'upcoming':r.status==='watch'?'watch':'open';
 const opening=upcoming(r)&&r.opensOn?`<p class="card-window">Applications open ${esc(formattedDate(r.opensOn))}</p>`:'';
 return `<article class="resource-card" style="animation-delay:${Math.min(i,5)*35}ms"><button class="card-save" data-save="${esc(r.id)}" aria-pressed="${savedState}" aria-label="${savedState?'Remove':'Save'} ${esc(r.title)}${savedState?' from collection':''}">${icon('bookmark')}</button>${visual(r)}<div class="card-body"><div class="card-topline"><span class="type-badge badge-${esc(r.category)}">${esc(labelFor(r.category))}</span><span class="application-status status-${stateClass}">${esc(status)}</span></div><h3><button data-open="${esc(r.id)}">${esc(r.title)}</button></h3><p class="card-summary">${esc(r.summary)}</p>${opening}<div class="card-meta"><span>${icon('pin')}${esc(place(r))}</span></div><div class="card-footer"><span class="deadline ${soon?'urgent':''}">${icon('clock')}${esc(deadlineText(r))}</span><button class="card-details" data-open="${esc(r.id)}" aria-label="Explore ${esc(r.title)}">Explore resource ${icon('up')}</button></div><div class="card-verified"><a href="${esc(r.sourceUrl||r.applyUrl)}" target="_blank" rel="noopener noreferrer">Official source ↗</a><span>Checked ${esc(checked(r))}</span></div></div></article>`;
}
function filtered(){
 const q=query.toLocaleLowerCase().trim();
 let result=data.filter(r=>(category==='all'||r.category===category)&&(!savedOnly||saved.has(r.id))&&regionMatches(r)&&availabilityMatches(r)&&(includeExpired||!isExpired(r))&&(!q||[r.title,r.summary,r.provider,r.category,r.region,r.audience,...(r.eligibility||[])].join(' ').toLocaleLowerCase().includes(q)));
 if(sort==='recommended'&&region==='all') result.sort((a,b)=>Number(a.region==='National')-Number(b.region==='National'));
 if(sort==='deadline') result.sort((a,b)=>(a.deadlineDate||'9999').localeCompare(b.deadlineDate||'9999'));
 if(sort==='az') result.sort((a,b)=>a.title.localeCompare(b.title));
 return result;
}
function renderCategories(){
 $('#categories').innerHTML=categories.map(c=>{
 const count=data.filter(r=>(includeExpired||!isExpired(r))&&(!savedOnly||saved.has(r.id))&&regionMatches(r)&&availabilityMatches(r)&&(c.id==='all'||r.category===c.id)).length;
 return `<button type="button" class="category-tab" data-category="${c.id}" aria-pressed="${c.id===category}">${icon(c.icon)}${c.label}<span class="tab-count">${count}</span></button>`;
 }).join('');
}
function updateSavedCount(){const n=data.filter(r=>saved.has(r.id)).length;document.querySelectorAll('.saved-count').forEach(e=>e.textContent=n);$('#saved-nav').setAttribute('aria-pressed',String(savedOnly));}
function render(){
 renderCategories();updateSavedCount();
 const rows=filtered(), showing=Math.min(limit,rows.length);
 $('#results-label').innerHTML=savedOnly?`<strong>Your collection</strong> · ${rows.length} saved resource${rows.length===1?'':'s'}`:`Showing <strong>${showing}</strong> of <strong>${rows.length}</strong> resources`;
 $('#collection-note').textContent=savedOnly?'Your collection is saved in this browser.':'New York and Maryland first. Dates are shown only when supported by official provider guidance.';
 $('#resource-grid').innerHTML=rows.length?rows.slice(0,limit).map(card).join(''):`<div class="empty-state">${icon(savedOnly?'bookmark':'search')}<h3>${savedOnly&&!query&&category==='all'?'Your next steps, all in one place.':'A different search could open a new door.'}</h3><p>${savedOnly?'Save a resource using its bookmark, and find it here whenever you’re ready.':'Try another keyword or broaden your filters to see more possibilities.'}</p><button class="btn secondary" data-reset>${savedOnly?'Explore all resources':'Clear search & filters'} ${icon('arrow')}</button></div>`;
 $('#load-more').hidden=limit>=rows.length;
 $('#active-search').hidden=!query&&!savedOnly;
 $('#active-search').innerHTML=`${savedOnly?'<span>Viewing your saved collection</span><button class="clear-query" data-browse>View all resources ×</button>':''}${query?`<span>Results for “${esc(query)}”</span><button class="clear-query" data-clear>Clear search ×</button>`:''}`;
 const count=Number(region!=='local')+Number(includeExpired)+Number(availability!=='all');
 $('#filter-count').hidden=!count;$('#filter-count').textContent=count;
}
function reset(){category='all';query='';region='local';includeExpired=false;availability='all';savedOnly=false;limit=6;sort='recommended';$('#search').value='';$('#region').value='local';$('#availability').value='all';$('#include-expired').checked=false;$('#sort').value='recommended';render();}
function chooseCategory(cat){category=cat;savedOnly=false;limit=6;render();}
function toggleSaved(id){
 const r=data.find(r=>r.id===id);if(!r)return;
 const removing=saved.has(id);if(removing)saved.delete(id);else saved.add(id);
 const kept=persist('smartmathz-saved-v1',[...saved]);render();
 toast(removing?'Removed from your collection':kept?'Saved to your collection · on this browser':'Saved for this visit · browser storage is unavailable');
 if(activeId===id && $('#resource-dialog').open){detail(r);$('#detail-save').focus();}
 else document.querySelector(`[data-save="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
}
function detail(r){
 const deadline=r.deadlineDate?formattedDate(r.deadlineDate):r.deadlineKind==='varies'?'Varies by programme':r.deadlineKind==='rolling'?'Rolling':'Not published';
 const type={application:'Application deadline',registration:'Registration deadline',nomination:'School nomination deadline',promotion:'Fee-free window ends',event:'Registration deadline',varies:'Deadline',unannounced:'Deadline',rolling:'Deadline'}[r.deadlineKind]||'Deadline';
 const timeline=[r.opensOn?`<li><strong>Applications open:</strong> ${esc(formattedDate(r.opensOn))}</li>`:'',r.eventDate?`<li><strong>Event / programme date:</strong> ${esc(formattedDate(r.eventDate))}</li>`:''].join('');
 $('#detail-content').innerHTML=`<div class="detail-topline"><span class="type-badge badge-${esc(r.category)}">${esc(labelFor(r.category))}</span><span class="detail-provider">${esc(r.provider)}</span><span class="application-status status-${isExpired(r)?'closed':upcoming(r)?'upcoming':r.status==='watch'?'watch':'open'}">${esc(applicationStatus(r))}</span></div><h2 id="detail-title">${esc(r.title)}</h2>${(r.description||[r.summary]).map(p=>`<p class="detail-summary">${esc(p)}</p>`).join('')}<div class="detail-facts"><div><small>LOCATION</small><strong>${esc(place(r))}</strong></div><div><small>APPLICATION CYCLE</small><strong>${esc(r.cycle||'Confirm with provider')}</strong></div><div><small>${esc(type.toUpperCase())}</small><strong>${esc(deadline)}</strong></div><div><small>FOR</small><strong>${esc(r.audience)}</strong></div></div>${timeline?`<h3>Important dates</h3><ul>${timeline}</ul>`:''}<h3>Is this for you?</h3><ul>${(r.eligibility||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul><h3>Your next steps</h3><ol>${(r.howToApply||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p class="source-note"><strong>Official source checked ${esc(checked(r))}.</strong> ${esc(r.verificationNote||'')} ${r.deadlineKind==='unannounced'?'The reviewed source has not published a complete new-cycle deadline. ':''}Confirm the latest requirements and the provider’s deadline time before applying. ${isExpired(r)?'This listing is closed or its published date has passed.':''}</p><div class="detail-actions"><a class="btn primary" href="${esc(r.applyUrl)}" target="_blank" rel="noopener noreferrer">${upcoming(r)?'View programme information':'Visit provider'} ${icon('up','small')}</a><button class="btn secondary" id="detail-save" data-save="${esc(r.id)}" aria-pressed="${saved.has(r.id)}">${icon('bookmark','small')}${saved.has(r.id)?'Saved':'Save resource'}</button></div><p class="detail-disclaimer">Source: <a href="${esc(r.sourceUrl||r.applyUrl)}" target="_blank" rel="noopener noreferrer">${esc(new URL(r.sourceUrl||r.applyUrl).hostname)} ↗</a>. Applications are completed directly with the provider.</p>`;
}
function openDetail(id){const r=data.find(r=>r.id===id);if(!r)return;activeId=id;detail(r);$('#resource-dialog').showModal();document.body.classList.add('dialog-open');}
function closeDetail(){$('#resource-dialog').close();}
function renderPlan(){
 const p=plans[plan];
 document.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.path===plan)));
 $('#path-explore').innerHTML=`Explore ${p.label} resources ${icon('arrow','small')}`;
 $('#plan-tasks').innerHTML=p.tasks.map((t,i)=>`<label class="plan-task"><input type="checkbox" data-task="${plan}-${i}" ${tasksDone[plan+'-'+i]?'checked':''}><span><strong>${esc(t[0])}</strong><small>${esc(t[1])}</small></span></label>`).join('');
 $('#plan-count').textContent=p.tasks.filter((_,i)=>tasksDone[plan+'-'+i]).length+' of 3';
}
$('#categories').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;limit=6;render();$('#categories').querySelector(`[data-category="${category}"]`)?.focus({preventScroll:true});}});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();query=$('#search').value.trim();limit=6;render();$('#explore').scrollIntoView({block:'start'});});
$('#search').addEventListener('input',()=>{query=$('#search').value.trim();limit=6;render();});
$('#sort').addEventListener('change',e=>{sort=e.target.value;limit=6;render();});
$('#region').addEventListener('change',e=>{region=e.target.value;limit=6;render();});
$('#availability').addEventListener('change',e=>{availability=e.target.value;limit=6;render();});
$('#include-expired').addEventListener('change',e=>{includeExpired=e.target.checked;limit=6;render();});
$('#filter-toggle').addEventListener('click',()=>{const expanded=$('#filter-toggle').getAttribute('aria-expanded')==='true';$('#filter-toggle').setAttribute('aria-expanded',String(!expanded));$('#filters').hidden=expanded;});
$('#reset-filters').addEventListener('click',()=>{region='local';includeExpired=false;availability='all';$('#region').value='local';$('#availability').value='all';$('#include-expired').checked=false;limit=6;render();});
$('#load-more').addEventListener('click',()=>{const previous=limit;limit+=6;render();const firstNew=$('#resource-grid').children[previous]?.querySelector('[data-open]');firstNew?.focus({preventScroll:true});});
$('#saved-nav').addEventListener('click',()=>{const before=savedOnly;reset();savedOnly=!before;includeExpired=savedOnly;if(savedOnly){region='all';$('#region').value='all';}$('#include-expired').checked=includeExpired;render();$('#explore').scrollIntoView({block:'start'});});
$('#resource-grid').addEventListener('click',e=>{const save=e.target.closest('[data-save]'),open=e.target.closest('[data-open]');if(save)toggleSaved(save.dataset.save);else if(open)openDetail(open.dataset.open);else if(e.target.closest('[data-reset]'))reset();else if(e.target.closest('[data-retry]'))loadData();});
$('#detail-content').addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(b)toggleSaved(b.dataset.save);});
$('#active-search').addEventListener('click',e=>{if(e.target.closest('[data-clear]')){query='';$('#search').value='';limit=6;render();$('#search').focus();}if(e.target.closest('[data-browse]'))reset();});
$('#close-dialog').addEventListener('click',closeDetail);
$('#resource-dialog').addEventListener('click',e=>{if(e.target===$('#resource-dialog'))closeDetail();});
$('#resource-dialog').addEventListener('close',()=>{document.body.classList.remove('dialog-open');const id=activeId;activeId=null;document.querySelector(`[data-open="${CSS.escape(id||'')}"]`)?.focus({preventScroll:true});});
for(const b of document.querySelectorAll('[data-hero-category]')) b.addEventListener('click',()=>{reset();chooseCategory(b.dataset.heroCategory);});
for(const b of document.querySelectorAll('[data-path]')) b.addEventListener('click',()=>{plan=b.dataset.path;renderPlan();});
$('#plan-tasks').addEventListener('change',e=>{if(e.target.matches('[data-task]')){tasksDone[e.target.dataset.task]=e.target.checked;persist('smartmathz-plan-v1',tasksDone);$('#plan-count').textContent=plans[plan].tasks.filter((_,i)=>tasksDone[plan+'-'+i]).length+' of 3';}});
$('#path-explore').addEventListener('click',()=>{reset();chooseCategory(plans[plan].category);});
$('#year').textContent=new Date().getFullYear();renderPlan();
function showFeedStatus(meta){
 const run=meta?.lastRun;const date=run?.completedAt?new Date(run.completedAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):null;
 $('#feed-check').textContent=date?`Last source review: ${date} ET${run.status==='partial'?' · Some sources need a retry':run.status==='failed'?' · Latest check needs attention':''}`:'Official-source collection';
 $('#source-cadence').textContent=meta?.automation?.enabled?'Official sources are checked daily. Each record keeps its own verification date; a daily check does not guarantee a new opportunity exists.':'This is a verified collection. Automatic checks have not been connected on this deployment.';
 $('#feed-cadence').textContent=meta?.automation?.enabled?'Daily source checks':'Official-source review';
}
async function loadData(quiet=false){
 try{const response=await fetch('/catalog.json',{cache:'no-store'});if(!response.ok)throw new Error('Catalog unavailable');const rows=await response.json();if(!Array.isArray(rows)||!rows.length)throw new Error('Empty catalog');data=rows;render();try{const m=await fetch('/api/feed-status',{cache:'no-store'});if(m.ok)showFeedStatus(await m.json());}catch{}}
 catch{if(quiet&&data.length)return;$('#resource-grid').innerHTML=`<div class="empty-state error-state">${icon('globe')}<h3>We couldn’t load the collection.</h3><p>Check your connection and give it another try.</p><button class="btn secondary" data-retry>Try again ${icon('arrow')}</button></div>`;$('#results-label').textContent='Collection temporarily unavailable';}
}
$('#sources-toggle').addEventListener('click',()=>{const details=$('#source-method');details.open=!details.open;$('#sources-toggle').setAttribute('aria-expanded',String(details.open));if(details.open)details.scrollIntoView({block:'center'});});
loadData();
setInterval(()=>{if(document.visibilityState==='visible'&&!$('#resource-dialog').open)loadData(true);},5*60*1000);
