/*
 * لعبة إعادة التجميع — أ/ فاطمة هزازي
 * JavaScript عادي بلا مكتبات أو اتصالات خارجية.
 * المراحل: collect -> decision -> group (عند الحاجة) -> ready -> answer -> success.
 * القطعة لا تُنسخ أثناء النقل. يُستبدل بالضبط ١٠ مكعبات بعمود واحد ذي ١٠ أجزاء.
 */
(() => {
  'use strict';
  const LEVELS = Object.freeze([
    { a: 28, b: 7, title: 'سرّ العشرة' },
    { a: 24, b: 8, title: 'قصصنا الجميلة' },
    { a: 26, b: 17, title: 'أشجار الحديقة' },
    { a: 51, b: 23, title: 'هل نحتاج إلى تبديل؟' },
    { a: 43, b: 7, title: 'العشرة المكتملة' }
  ]);
  const EXAMPLES = [[28,7],[24,8],[26,17],[51,23],[43,7],[61,19],[38,18],[44,5]];
  const STORAGE_KEY = 'fatimah-regrouping-v1';
  const PHASES = ['collect','decision','group','ready','answer','success'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  const latin = s => String(s).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const integerInput = s => /^\d{1,2}$/.test(latin(s).trim()) ? Number(latin(s).trim()) : NaN;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let storageAvailable = true;
  let store = loadStore();
  let round = null;
  let busy = false;
  let keyboardMode = false;
  let toastTimer = null;
  let installEvent = null;
  let pendingConfirmation = null;
  let drag = null;
  let suppressClickUntil = 0;

  function loadStore() {
    const empty = {version:1, name:'', scores:[0,0,0,0,0], round:null};
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== 1) return empty;
      empty.name = typeof parsed.name === 'string' ? parsed.name.slice(0,35) : '';
      if (Array.isArray(parsed.scores) && parsed.scores.length === 5) {
        empty.scores = parsed.scores.map(n=>Number.isInteger(n)&&n>=0&&n<=3?n:0);
      }
      if (validSavedRound(parsed.round)) empty.round = parsed.round;
      return empty;
    } catch (_) { storageAvailable = false; return empty; }
  }

  function validSavedRound(s) {
    if (!s || s.mode !== 'adventure' || !Number.isInteger(s.index) || !LEVELS[s.index]) return false;
    const l = LEVELS[s.index];
    if (s.a !== l.a || s.b !== l.b || !PHASES.includes(s.phase)) return false;
    if (![s.moved,s.picked,s.exchangedIds].every(Array.isArray)) return false;
    if (typeof s.exchanged !== 'boolean' || typeof s.decisionMade !== 'boolean') return false;
    const originals = pieces(s.a,'a');
    const added = pieces(s.b,'b');
    const unitIds = [...originals,...added].filter(x=>x.kind==='u').map(x=>x.id);
    if (new Set(s.moved).size !== s.moved.length || s.moved.some(id=>!added.some(x=>x.id===id))) return false;
    if (new Set(s.picked).size!==s.picked.length || s.picked.length>10 || s.picked.some(id=>!unitIds.includes(id))) return false;
    if (new Set(s.exchangedIds).size!==s.exchangedIds.length || s.exchangedIds.some(id=>!unitIds.includes(id))) return false;
    if (s.exchanged ? s.exchangedIds.length!==10 || s.picked.length!==0 : s.exchangedIds.length!==0) return false;
    if (s.phase!=='collect' && s.moved.length!==added.length) return false;
    if (s.phase==='group' && (!s.decisionMade || unitIds.length<10 || s.exchanged)) return false;
    if (['ready','answer','success'].includes(s.phase) && (!s.decisionMade || (unitIds.length>=10 && !s.exchanged))) return false;
    if (s.phase==='collect' && (s.exchanged || s.picked.length || s.decisionMade)) return false;
    if (s.phase==='decision' && (s.exchanged || s.picked.length || s.decisionMade)) return false;
    return true;
  }

  function save() {
    if (!storageAvailable) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (_) { storageAvailable = false; toast('التخزين غير متاح في هذا المتصفح. ستعمل اللعبة، لكن لن يُحفَظ التقدّم بعد الإغلاق.'); }
  }
  function saveRound() {
    if (round && round.mode==='adventure') store.round = JSON.parse(JSON.stringify(round));
    save();
  }
  function newRound(mode,index,a,b) {
    return {mode,index,a,b,phase:'collect',moved:[],picked:[],exchangedIds:[],exchanged:false,decisionMade:false,feedback:'',tone:'',id:Date.now()+Math.random()};
  }
  function pieces(n,prefix) {
    const out=[];
    for (let i=0;i<Math.floor(n/10);i++) out.push({id:`${prefix}-t-${i}`,kind:'t',value:10});
    for (let i=0;i<n%10;i++) out.push({id:`${prefix}-u-${i}`,kind:'u',value:1});
    return out;
  }
  function allPieces() { return [...pieces(round.a,'a'),...pieces(round.b,'b')]; }
  function units() { return allPieces().filter(p=>p.kind==='u'); }
  function initialTens() { return allPieces().filter(p=>p.kind==='t'); }
  function needsRegroup() { return round.a%10+round.b%10>=10; }
  function transferredAll() { return round.moved.length===pieces(round.b,'b').length; }
  function earnedThisRound() {
    if (!round) return 0;
    if (round.phase==='success') return 3;
    if (['ready','answer'].includes(round.phase)) return 2;
    if (round.phase!=='collect') return 1;
    return 0;
  }
  function earnStage(n) {
    if (round.mode==='adventure') store.scores[round.index] = Math.max(store.scores[round.index],n);
    saveRound();
    $('#total-stars').textContent=ar(store.scores.reduce((a,b)=>a+b,0));
  }
  function showView(view) {
    for (const id of ['welcome','game','finish']) $('#'+id).hidden = id!==view;
    document.body.dataset.view=view;
  }
  function updateName() {
    store.name=$('#student-name').value.trim().slice(0,35);
    save();
  }
  function home() {
    saveRound();
    showView('welcome');
    $('#student-name').value=store.name;
    $('#resume-button').hidden=!store.round;
    const completed=store.scores.filter(x=>x===3).length;
    $('#journey-caption').textContent=`أنجزت ${ar(completed)} من ${ar(LEVELS.length)} محطات · ${ar(store.scores.reduce((a,b)=>a+b,0))} نجمة`;
    $('#total-stars').textContent=ar(store.scores.reduce((a,b)=>a+b,0));
    $('#start-button').innerHTML=completed===5?'أعد المغامرة <span aria-hidden="true">✦</span>':'ابدأ المغامرة <span aria-hidden="true">✦</span>';
    $('#level-cards').replaceChildren(...LEVELS.map((l,i)=>{
      const b=document.createElement('button'); b.type='button'; b.className='level-card'+(store.scores[i]===3?' completed':'');
      b.dataset.action='level';b.dataset.index=i;
      const n=document.createElement('span');n.className='level-num';n.textContent=ar(i+1);
      const title=document.createElement('b');title.textContent=l.title;
      const star=document.createElement('span');star.className='level-star';star.setAttribute('aria-label',`${ar(store.scores[i])} من ٣ نجوم`);
      for(let k=0;k<3;k++){const s=document.createElement('span');s.textContent='★';if(k<store.scores[i])s.className='on';star.append(s);}
      b.append(n,title,star);return b;
    }));
  }
  function startLevel(i) {
    updateName();
    const l=LEVELS[i]; if(!l)return;
    round=newRound('adventure',i,l.a,l.b);
    saveRound();showView('game');renderGame();window.scrollTo({top:0,behavior:'auto'});
  }
  function beginAdventure() {
    const i=store.scores.findIndex(x=>x<3);startLevel(i<0?0:i);
  }
  function resume() {
    updateName();
    if(!validSavedRound(store.round)){beginAdventure();return;}
    round=JSON.parse(JSON.stringify(store.round));round.feedback='';round.tone='';
    showView('game');renderGame();window.scrollTo({top:0,behavior:'auto'});
  }
  function stageCopy() {
    const u=units().length;
    if(round.phase==='collect') return transferredAll()
      ? ['جمعتَ نماذج العددين!','انظر إلى الآحاد التي اجتمعت، ثم اضغط «انتقل إلى إعادة التجميع».']
      : ['١ · اجمع النماذج','ابدأ من العدد المضاف يمينًا. انقل الآحاد إلى الآحاد، والعشرات إلى العشرات، باللمس أو السحب.'];
    if(round.phase==='decision') return ['٢ · هل نحتاج إلى إعادة التجميع؟',`عدّ الآحاد في لوحة «بعد الجمع». عددها الآن ${ar(u)}. هل تستطيع تكوين مجموعة من ١٠ آحاد؟`];
    if(round.phase==='group') return ['٢ · كوِّن عشرة واحدة','المس ١٠ مكعبات في لوحة الجمع، أو اسحبها إلى صندوق العشرة. ثم اضغط زر التبديل.'];
    if(round.phase==='ready') return round.exchanged
      ? ['تبديل ناجح! القيمة لم تتغيّر',`استبدلتَ ١٠ آحاد بعشرة واحدة. بقي ${ar(u-10)} في الآحاد، وأصبح عدد العشرات ${ar(initialTens().length+1)}.`]
      : ['لا نحتاج إلى إعادة التجميع',`عدد الآحاد ${ar(u)}؛ وهو أقل من ١٠. نحتفظ بالعشرات والآحاد كما هي.`];
    if(round.phase==='answer')return ['٣ · اكتب الناتج وتحقّق','عدّ العشرات والآحاد في لوحة الجمع، ثم اكتب الناتج في البطاقة الصفراء.'];
    return ['أحسنت، اكتملت المحطة!','كسبتَ نجمة لكل خطوة: جمع النماذج، وفهم إعادة التجميع، وكتابة الناتج.'];
  }

  function token(piece,action=null) {
    const el=document.createElement(action?'button':'span');
    el.className='token '+(piece.kind==='u'?'cube':'rod')+(action?' interactive':'');
    el.dataset.id=piece.id;el.dataset.kind=piece.kind;
    if(action){el.type='button';el.dataset.action=action;}
    else {el.setAttribute('role','img');}
    const label=piece.kind==='u'?'مكعب آحاد واحد':'عمود عشرات يساوي ١٠ آحاد';
    el.setAttribute('aria-label',(action==='move-source'?'انقل: ':action==='pick'?'ضع في صندوق العشرة: ':action==='unpick'?'أعد إلى الآحاد: ':'')+label);
    el.title=label;
    if(piece.kind==='t') for(let i=0;i<10;i++){const cell=document.createElement('span');cell.className='rod-cell';cell.setAttribute('aria-hidden','true');el.append(cell);}
    return el;
  }
  function renderPieces(selector,list,action=null,emptyText='') {
    const container=$(selector);container.replaceChildren(...list.map(p=>token(p,action)));
    if(!list.length && emptyText){const e=document.createElement('span');e.className='empty-place';e.textContent=emptyText;container.append(e);}
  }
  function renderGame() {
    if(!round)return;
    const focused=document.activeElement?.closest?.('.token.interactive');
    const focusAction=focused?.dataset.action;
    const focusId=focused?.dataset.id;
    const active=round.phase==='collect';
    const showSum=!active;
    const originalA=pieces(round.a,'a'),originalB=pieces(round.b,'b');
    const transferred=originalB.filter(p=>round.moved.includes(p.id));
    const first=active?[...originalA,...transferred]:originalA;
    const source=active?originalB.filter(p=>!round.moved.includes(p.id)):originalB;
    const [title,text]=stageCopy();
    $('#instruction-title').textContent=title;$('#instruction').textContent=text;
    $('#mode-badge').textContent=round.mode==='adventure'?'المغامرة':'تدريب حر';
    $('#level-heading').textContent=round.mode==='adventure'?`المحطة ${ar(round.index+1)} من ${ar(LEVELS.length)}`:'مسألة من اختيارك';
    $('#level-dots').replaceChildren(...LEVELS.map((_,i)=>{
      const b=document.createElement('button');b.type='button';b.className='level-dot';
      if(store.scores[i]===3)b.classList.add('done');if(round.mode==='adventure'&&round.index===i)b.classList.add('active');
      b.textContent=ar(i+1);b.dataset.action='level';b.dataset.index=i;b.setAttribute('aria-label',`المحطة ${ar(i+1)}`);return b;
    }));
    $('#equation-a').textContent=ar(round.a);$('#equation-b').textContent=ar(round.b);$('#equation-result').textContent=round.phase==='success'?ar(round.a+round.b):'؟';
    $('#first-number').textContent=ar(round.a);
    // Never label a combined model as the original number, and never reveal the
    // final sum during collection. The original addends return as references later.
    $('#first-number').hidden=active&&round.moved.length>0;
    $('#first-title').textContent=active&&round.moved.length?'أجمع نماذج العددين':'العدد الأول';
    $('#first-card').classList.toggle('collecting',active&&round.moved.length>0);
    $('#source-title').textContent=active&&round.moved.length?'المتبقي للنقل':'العدد المضاف';
    $('#source-number').textContent=ar(active?source.reduce((n,p)=>n+p.value,0):round.b);
    $('#first-card').classList.toggle('reference',!active);$('#source-card').classList.toggle('reference',!active);
    $('#source-card').classList.toggle('only-ones',Math.floor(round.b/10)===0);
    $('#source-tens-place').hidden=round.b<10;$('#source-ones-title').textContent=round.b<10?'آحاد فقط':'الآحاد';
    renderPieces('#first-ones',first.filter(p=>p.kind==='u'),null,'لا توجد آحاد');
    renderPieces('#first-tens',first.filter(p=>p.kind==='t'),null);
    renderPieces('#source-ones',source.filter(p=>p.kind==='u'),active?'move-source':null,active&&round.b%10?'نُقلت الآحاد':'لا توجد آحاد');
    renderPieces('#source-tens',source.filter(p=>p.kind==='t'),active?'move-source':null);
    $('#first-note').textContent=active?(round.moved.length?`عدد الآحاد الآن: ${ar(first.filter(p=>p.kind==='u').length)}`:'اسحب إلى المنزلة المناسبة'):'النموذج الأصلي للعدد الأول';
    $('#source-note').textContent=active?(transferredAll()?'نقلتَ جميع النماذج ✓':'المس النموذج أو اسحبه'):'النموذج الأصلي للعدد المضاف';
    $('#sum-locked').hidden=showSum;$('#sum-body').hidden=!showSum;
    $('#sum-card').classList.toggle('needs-regroup',showSum&&needsRegroup()&&!round.exchanged);
    $('#sum-title').innerHTML=`<span class="lamp" aria-hidden="true">✦</span> ${round.exchanged?'بعد إعادة التجميع':'بعد الجمع'}`;
    if(showSum){
      const available=units().filter(p=>!round.exchangedIds.includes(p.id)&&!round.picked.includes(p.id));
      renderPieces('#sum-ones',available,round.phase==='group'?'pick':null,round.picked.length?'الآحاد داخل الصندوق':'لا توجد آحاد');
      const tens=[...initialTens(),...(round.exchanged?[{id:'regrouped-t-0',kind:'t',value:10}]:[])];
      renderPieces('#sum-tens',tens);
      const newRod=$('#sum-tens [data-id="regrouped-t-0"]');if(newRod)newRod.classList.add('new-rod');
      $('#decision').hidden=round.phase!=='decision';
      $('#bundle-area').hidden=round.phase!=='group';
      $('#exchange-button').hidden=round.phase!=='group';
      $('#exchange-button').disabled=round.picked.length!==10||busy;
      const frame=$('#ten-frame');frame.replaceChildren();
      for(let i=0;i<10;i++){
        if(i<round.picked.length){const p=units().find(x=>x.id===round.picked[i]);frame.append(token(p,'unpick'));}
        else {const s=document.createElement('span');s.className='frame-slot';s.setAttribute('aria-hidden','true');frame.append(s);}
      }
      $('#bundle-count').textContent=`${ar(round.picked.length)} من ١٠`;
      $('#place-summary').hidden=!['ready','answer','success'].includes(round.phase);
      $('#place-summary').textContent=`العشرات: ${ar(tens.length)}  |  الآحاد: ${ar(available.length)}`;
    }
    $('#locked-answer').hidden=['answer','success'].includes(round.phase);
    $('#answer-form').hidden=round.phase!=='answer';$('#success-answer').hidden=round.phase!=='success';
    if(round.phase==='success'){
      $('#final-number').textContent=ar(round.a+round.b);
      $('#success-text').textContent=round.exchanged?'حوّلتَ ١٠ آحاد إلى عشرة واحدة.':'جمعتَ دون إعادة تجميع.';
    }
    const feedback=$('#stage-feedback');feedback.className='stage-feedback'+(round.tone?' '+round.tone:'');
    feedback.textContent=round.feedback || (active?`نُقل ${ar(round.moved.length)} من ${ar(originalB.length)} نماذج` : round.phase==='group'?`اختر ١٠ آحاد. وضعتَ الآن ${ar(round.picked.length)}.` : round.phase==='decision'?'اختر «نعم» أو «لا» في لوحة الجمع.':round.phase==='answer'?'استخدم لوحة الأرقام أو لوحة المفاتيح.':'قيمة النماذج ثابتة؛ تغيّر شكل تمثيلها فقط.');
    $('#undo-button').hidden=!active;$('#undo-button').disabled=!round.moved.length||busy;
    const next=$('#continue-button');next.hidden=round.phase==='answer';next.disabled=busy;
    if(active){next.disabled=!transferredAll()||busy;next.textContent='انتقل إلى إعادة التجميع ←';}
    else if(['decision','group'].includes(round.phase)){next.disabled=true;next.textContent='أكمل خطوة إعادة التجميع';}
    else if(round.phase==='ready'){next.textContent='أكتب الناتج ←';}
    else if(round.phase==='success'){next.textContent=round.mode==='custom'?'أتدرّب على مسألة أخرى':round.index===LEVELS.length-1?'أنهي المغامرة ★':'المحطة التالية ←';}
    const stage=active?1:['decision','group','ready'].includes(round.phase)?2:3;
    for(const e of $$('.stage-card')){
      const n=Number(e.dataset.stage);e.classList.toggle('current',stage===n);e.classList.toggle('complete',n<=earnedThisRound());
      e.querySelector('.stage-star').textContent=n<=earnedThisRound()?'★':'☆';
    }
    $('#total-stars').textContent=ar(store.scores.reduce((a,b)=>a+b,0));
    if(keyboardMode&&focused){
      const candidates=$$(`.token.interactive[data-action="${focusAction}"]`);
      const same=candidates.find(e=>e.dataset.id===focusId);
      (same||candidates[0])?.focus({preventScroll:true});
    }
  }
  function feedback(message,tone='') { round.feedback=message;round.tone=tone;renderGame();saveRound(); }
  function clearFeedback() { round.feedback='';round.tone='';$('#answer-feedback').textContent='';$('#answer-feedback').className='answer-feedback'; }
  function fly(piece,rect,target) {
    if(!target||!rect||reduced())return Promise.resolve();
    const end=target.getBoundingClientRect();
    const ghost=token(piece);ghost.classList.add('drag-ghost');ghost.setAttribute('aria-hidden','true');
    ghost.style.left=rect.left+'px';ghost.style.top=rect.top+'px';ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';
    document.body.append(ghost);target.classList.add('fly-hidden');
    const anim=ghost.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${end.left-rect.left}px,${end.top-rect.top}px) scale(1)`}],{duration:270,easing:'cubic-bezier(.2,.7,.3,1)'});
    return anim.finished.catch(()=>{}).then(()=>{ghost.remove();target.classList.remove('fly-hidden');});
  }
  async function moveSource(id,startRect=null) {
    if(busy||!round||round.phase!=='collect'||round.moved.includes(id))return;
    const p=pieces(round.b,'b').find(p=>p.id===id);if(!p)return;
    const start=startRect||$(`#source-card [data-id="${id}"]`)?.getBoundingClientRect();
    clearFeedback();round.moved.push(id);renderGame();saveRound();
    const target=$(`#first-card [data-id="${id}"]`);await fly(p,start,target);
    if(round.phase==='collect'&&transferredAll())feedback('أحسنت! اجتمعت نماذج العددين. انتقل إلى الخطوة التالية.','positive');
  }
  function undo() {
    if(round?.phase!=='collect'||!round.moved.length)return;
    round.moved.pop();clearFeedback();renderGame();saveRound();
  }
  function continueGame() {
    if(!round||busy)return;
    if(round.phase==='collect'&&transferredAll()){
      clearFeedback();round.phase='decision';earnStage(1);renderGame();scrollInto('#sum-card');
    }else if(round.phase==='ready'){
      clearFeedback();round.phase='answer';$('#answer-input').value='';renderGame();saveRound();scrollInto('#answer-card');
      if(keyboardMode)$('#answer-input').focus({preventScroll:true});
    }else if(round.phase==='success'){
      if(round.mode==='custom')openTeacher();
      else if(round.index<LEVELS.length-1)startLevel(round.index+1);
      else showFinish();
    }
  }
  function decide(answer) {
    if(!round||round.phase!=='decision')return;
    if(answer!==needsRegroup()){
      feedback(needsRegroup()?`عدد الآحاد ${ar(units().length)}، وهو ١٠ فأكثر. يمكن تكوين عشرة كاملة. حاول مرة أخرى.`:`عدد الآحاد ${ar(units().length)}، وهو أقل من ١٠؛ لا تكتمل مجموعة من عشرة. حاول مرة أخرى.`,'error');return;
    }
    clearFeedback();round.decisionMade=true;
    if(needsRegroup()){round.phase='group';round.feedback='صحيح! ضع ١٠ مكعبات فقط في صندوق العشرة.';round.tone='positive';}
    else {round.phase='ready';round.feedback='صحيح! لا نحتاج إلى إعادة التجميع، لأن الآحاد أقل من ١٠.';round.tone='positive';earnStage(2);}
    renderGame();saveRound();
  }
  async function pick(id,startRect=null) {
    if(busy||!round||round.phase!=='group'||round.picked.includes(id))return;
    const p=units().find(p=>p.id===id);if(!p)return;
    if(round.picked.length>=10){toast('اكتمل صندوق العشرة. اضغط زر التبديل؛ لا نضيف مكعبًا آخر.');return;}
    const start=startRect||$(`#sum-ones [data-id="${id}"]`)?.getBoundingClientRect();
    clearFeedback();round.picked.push(id);renderGame();saveRound();
    await fly(p,start,$(`#ten-frame [data-id="${id}"]`));
    if(round?.phase==='group'&&round.picked.length===10)feedback('اكتمل الصندوق: ١٠ آحاد. اضغط زر التبديل.','positive');
  }
  function unpick(id) {
    if(busy||!round||round.phase!=='group')return;
    round.picked=round.picked.filter(x=>x!==id);clearFeedback();renderGame();saveRound();
  }
  async function exchange() {
    if(busy||!round||round.phase!=='group'||round.picked.length!==10)return;
    busy=true;$('#exchange-button').disabled=true;
    const frame=$('#ten-frame');const rect=frame.getBoundingClientRect();
    try {
      if(!reduced())await frame.animate([{transform:'scale(1)',opacity:1},{transform:'scale(.35)',opacity:.15}],{duration:320,easing:'ease-in'}).finished;
      round.exchangedIds=round.picked.slice();round.picked=[];round.exchanged=true;round.phase='ready';
      clearFeedback();round.feedback='استبدلنا ١٠ آحاد بعشرة واحدة؛ لم تتغيّر القيمة.';round.tone='positive';earnStage(2);renderGame();
      const p={id:'regrouped-t-0',kind:'t',value:10};
      await fly(p,{left:rect.left+rect.width/2-9,top:rect.top-15,width:17,height:112},$('#sum-tens [data-id="regrouped-t-0"]'));
    } finally {busy=false;renderGame();saveRound();}
  }
  function checkAnswer() {
    if(!round||round.phase!=='answer'||busy)return;
    const input=$('#answer-input');const n=integerInput(input.value);
    const feedbackEl=$('#answer-feedback');
    if(!Number.isInteger(n)){feedbackEl.textContent='اكتب الناتج أولًا.';feedbackEl.className='answer-feedback error';return;}
    if(n!==round.a+round.b){feedbackEl.textContent='اقتربت! عُدّ العشرات والآحاد المتبقية، ثم حاول مرة أخرى.';feedbackEl.className='answer-feedback error';input.setAttribute('aria-invalid','true');return;}
    input.removeAttribute('aria-invalid');clearFeedback();round.phase='success';earnStage(3);renderGame();celebrate();saveRound();
  }
  function keyboardNumber(key) {
    if(!round||round.phase!=='answer')return;
    const input=$('#answer-input');let value=latin(input.value).replace(/\D/g,'');
    if(key==='back')value=value.slice(0,-1);else if(key==='clear')value='';else if(value.length<2)value+=key;
    input.value=ar(value);input.removeAttribute('aria-invalid');$('#answer-feedback').textContent='';
  }
  function restart() {
    if(!round)return;
    confirmAction('إعادة المحاولة؟','ستعود هذه المسألة إلى البداية. ستبقى النجوم التي كسبتها محفوظة.',()=>{
      round=newRound(round.mode,round.index,round.a,round.b);$('#answer-input').value='';$('#answer-feedback').textContent='';renderGame();saveRound();
    });
  }
  function showFinish() {
    saveRound();showView('finish');
    const complete=store.scores.every(x=>x===3);
    $('#finish-title').textContent=complete?'أنت بطل إعادة التجميع':'وصلت إلى نهاية الرحلة!';
    $('#finish-name').textContent=store.name||'يا بطل الرياضيات';
    $('#finish-score').textContent=`${ar(store.scores.reduce((a,b)=>a+b,0))} نجمة من ١٥`;
    $('#finish .pill').textContent=complete?'تمّت المغامرة!':'أكمل محطاتك واجمع النجوم';
    $('#finish [data-action="certificate"]').disabled=!complete;
    window.scrollTo({top:0,behavior:'auto'});if(complete)celebrate();
  }
  function openHelp() {
    $('#context-help').textContent=round&&!$('#game').hidden?stageCopy()[1]:'ابدأ من العدد المضاف على يمين اللوحة. لا تقلق من الخطأ؛ يمكنك المحاولة والتعلّم دون أن تفقد نجومك.';
    $('#help-dialog').showModal();
  }
  function openTeacher() {
    if(round){$('#custom-a').value=ar(round.a);$('#custom-b').value=ar(round.b);}
    $('#custom-error').textContent='';$('#teacher-dialog').showModal();
  }
  function startCustom(a=null,b=null) {
    const aa=a??integerInput($('#custom-a').value);const bb=b??integerInput($('#custom-b').value);
    if(!Number.isInteger(aa)||aa<10||aa>99||!Number.isInteger(bb)||bb<1||bb>99){$('#custom-error').textContent='أدخل عددًا أول من ١٠ إلى ٩٩، وعددًا مضافًا من ١ إلى ٩٩.';return;}
    if(aa+bb>=100){$('#custom-error').textContent='اختر عددين مجموعهما أقل من ١٠٠؛ هذه اللعبة مخصّصة للآحاد والعشرات.';return;}
    updateName();saveRound();round=newRound('custom',0,aa,bb);$('#teacher-dialog').close();$('#answer-input').value='';$('#answer-feedback').textContent='';showView('game');renderGame();window.scrollTo({top:0,behavior:'auto'});
  }
  function confirmAction(title,message,fn) {
    const dialog=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;pendingConfirmation=fn;dialog.showModal();
  }
  function certificate() {
    if(!store.scores.every(n=>n===3)){toast('أكمل المحطات الخمس أولًا لتحصل على شهادة الإنجاز.');return;}
    $('#certificate-name').textContent=store.name||'بطل الرياضيات';$('#certificate-dialog').showModal();
  }
  function scrollInto(sel) {
    if(window.innerWidth<=700)requestAnimationFrame(()=>$(sel).scrollIntoView({behavior:reduced()?'auto':'smooth',block:'center'}));
  }
  function toast(message) {
    clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);
  }
  function celebrate() {
    if(reduced())return;
    const host=$('#confetti');const colors=['#f6ba2b','#3cb5d9','#7bbe52','#ef8f53','#ae77d4'];
    for(let i=0;i<32;i++){
      const e=document.createElement('span');e.className='confetti-piece';e.textContent=i%4?'✦':'★';e.style.left=Math.random()*100+'%';e.style.color=colors[i%colors.length];e.style.setProperty('--dx',(Math.random()-.5)*180+'px');e.style.animationDelay=Math.random()*.55+'s';host.append(e);setTimeout(()=>e.remove(),2700);
    }
  }
  function beginDrag(e) {
    const target=e.target.closest('.token.interactive');if(!target||busy||e.button!==0||drag)return;
    if(!['move-source','pick','unpick'].includes(target.dataset.action))return;
    keyboardMode=false;
    drag={id:target.dataset.id,action:target.dataset.action,kind:target.dataset.kind,target,pointerId:e.pointerId,x:e.clientX,y:e.clientY,rect:target.getBoundingClientRect(),started:false,ghost:null};
    try{target.setPointerCapture(e.pointerId);}catch(_){}
  }
  function moveDrag(e) {
    if(!drag||e.pointerId!==drag.pointerId)return;
    if(!drag.started&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
    if(!drag.started){
      drag.started=true;drag.target.classList.add('drag-origin');
      const ghost=drag.target.cloneNode(true);ghost.classList.add('drag-ghost');ghost.classList.remove('interactive');ghost.removeAttribute('data-action');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.style.width=drag.rect.width+'px';ghost.style.height=drag.rect.height+'px';document.body.append(ghost);drag.ghost=ghost;
    }
    e.preventDefault();
    drag.ghost.style.left=(e.clientX-drag.rect.width/2)+'px';drag.ghost.style.top=(e.clientY-drag.rect.height/2)+'px';
    $$('.drop-hover').forEach(x=>x.classList.remove('drop-hover'));
    const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop]');
    if(zone)zone.classList.add('drop-hover');
  }
  function endDrag(e,cancel=false) {
    if(!drag||e.pointerId!==drag.pointerId)return;
    const d=drag;drag=null;d.target.classList.remove('drag-origin');
    try{d.target.releasePointerCapture(e.pointerId);}catch(_){}
    $$('.drop-hover').forEach(x=>x.classList.remove('drop-hover'));d.ghost?.remove();
    if(!d.started)return;
    suppressClickUntil=Date.now()+350;e.preventDefault();
    if(cancel)return;
    const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop]')?.dataset.drop;
    if(d.action==='move-source'){
      const expected=d.kind==='u'?'first-ones':'first-tens';
      if(zone===expected)moveSource(d.id,d.rect);
      else toast(d.kind==='u'?'ضع مكعب الآحاد في خانة الآحاد للعدد الأول.':'ضع عمود العشرات في خانة العشرات للعدد الأول.');
    }else if(d.action==='pick'){
      if(zone==='bundle')pick(d.id,d.rect);else toast('اسحب المكعب إلى صندوق العشرة، أو المسه لإضافته.');
    }else if(d.action==='unpick'){
      if(zone==='sum-ones')unpick(d.id);
    }
  }

  // Events are delegated so that replacing the visual blocks never loses their handlers.
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
    e.preventDefault();if(Date.now()<suppressClickUntil||busy)return;
    const act=el.dataset.action;
    if(act==='home')home();
    else if(act==='start')beginAdventure();
    else if(act==='resume')resume();
    else if(act==='level')startLevel(Number(el.dataset.index));
    else if(act==='move-source')void moveSource(el.dataset.id);
    else if(act==='pick')void pick(el.dataset.id);
    else if(act==='unpick')unpick(el.dataset.id);
    else if(act==='exchange')void exchange();
    else if(act==='decision-yes')decide(true);
    else if(act==='decision-no')decide(false);
    else if(act==='continue')continueGame();
    else if(act==='undo')undo();
    else if(act==='check')checkAnswer();
    else if(act==='digit')keyboardNumber(el.dataset.key);
    else if(act==='restart')restart();
    else if(act==='help')openHelp();
    else if(act==='teacher')openTeacher();
    else if(act==='start-custom')startCustom();
    else if(act==='example')startCustom(Number(el.dataset.a),Number(el.dataset.b));
    else if(act==='close-dialog')el.closest('dialog')?.close();
    else if(act==='certificate')certificate();
    else if(act==='print-certificate')window.print();
    else if(act==='fullscreen'){
      if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
      else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>toast('ملء الشاشة غير متاح في هذه النافذة.'));
      else toast('استخدم خيار ملء الشاشة في متصفحك.');
    }
    else if(act==='reset-progress')confirmAction('مسح التقدّم؟','سيُحذف الاسم والنجوم والتقدّم المحفوظ على هذا المتصفح فقط. هل تريد البدء من جديد؟',()=>{
      store={version:1,name:'',scores:[0,0,0,0,0],round:null};round=null;save();$('#teacher-dialog').close();home();toast('أصبحت الرحلة جاهزة لبداية جديدة.');
    });
    else if(act==='install')void install();
  });
  document.addEventListener('keydown',e=>{
    keyboardMode=true;
    if(e.key==='Enter'&&e.target.id==='answer-input'){e.preventDefault();checkAnswer();}
  });
  document.addEventListener('pointerdown',beginDrag);
  document.addEventListener('pointermove',moveDrag,{passive:false});
  document.addEventListener('pointerup',e=>endDrag(e));
  document.addEventListener('pointercancel',e=>endDrag(e,true));
  $('#confirm-yes').addEventListener('click',()=>{const fn=pendingConfirmation;pendingConfirmation=null;$('#confirm-dialog').close();fn?.();});
  $('#confirm-dialog').addEventListener('close',()=>{pendingConfirmation=null;});
  $('#student-name').addEventListener('change',updateName);
  for(const id of ['answer-input','custom-a','custom-b']){
    $('#'+id).addEventListener('input',e=>{
      const t=e.target;const value=latin(t.value).replace(/\D/g,'').slice(0,2);t.value=ar(value);t.removeAttribute('aria-invalid');
      if(id==='answer-input')$('#answer-feedback').textContent='';
    });
  }
  const numberPad=$('.number-pad');
  for(const k of ['1','2','3','4','5','6','7','8','9','back','0','clear']){
    const b=document.createElement('button');b.type='button';b.dataset.action='digit';b.dataset.key=k;
    b.textContent=k==='back'?'⌫':k==='clear'?'مسح':ar(k);if(k==='clear')b.className='clear-key';
    b.setAttribute('aria-label',k==='back'?'حذف آخر رقم':k==='clear'?'مسح الناتج':ar(k));numberPad.append(b);
  }
  $('#example-buttons').replaceChildren(...EXAMPLES.map(([a,b])=>{
    const el=document.createElement('button');el.type='button';el.dataset.action='example';el.dataset.a=a;el.dataset.b=b;el.textContent=ar(b)+' + '+ar(a);return el;
  }));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('#install-button').hidden=false;});
  async function install() {
    if(!installEvent){toast('افتح قائمة المتصفح واختر إضافة إلى الشاشة الرئيسية، إن كان الخيار متاحًا.');return;}
    try{await installEvent.prompt();await installEvent.userChoice;}catch(_){}
    installEvent=null;$('#install-button').hidden=true;
  }
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && $('link[rel="manifest"]')){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  // Read-only state snapshots make classroom troubleshooting and automated testing easy.
  window.RegroupingGame=Object.freeze({version:'1.0.0',levels:LEVELS.map(x=>({...x})),snapshot:()=>round?JSON.parse(JSON.stringify(round)):null});
  home();
})();
