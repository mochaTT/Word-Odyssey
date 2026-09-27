const STAGE_SIZE = 100;
const NUM_STAGES = Math.ceil(WORDS.length / STAGE_SIZE);
const DAILY_GOAL = 100;
const AREA_NAMES = ["はじまりの島","緑の森","湖の町","雪の山","太陽の丘","星降る谷","虹の岬","深緑の森","青い湖畔","古の遺跡","風の高原","満月の丘","霧の谷","黄金の平原","静寂の森","波音の浜","氷結の峰","光の回廊","夢見の丘","終わりなき草原","蒼穹の塔","銀河の橋","刻の遺跡","世界の果て"];
const COLLECTION_POOL = ["🌳","🐦","🏠","🌸","🦊","🏪","🌾","🐱","🏫","🍄","🐇","🏯","🌻","🦉","🗼","🍀","🐿️","💒","🌺","🦋","🎡","🌿","🐸","🗻","🏆","🎁","💎","👑"];
const UNLOCK_EVERY = 5;
const MASCOT_LINES = {
  home:["今日もがんばろう！","一つずつ覚えていこう！","キミの世界を育てよう！"],
  ok:["やったね！","その調子！","覚えてきたね！"],
  ng:["だいじょうぶ、次いこう！","もう一度確認しよう！"],
  dk:["少しずつ覚えていこう！","次は分かるはず！"]
};

let state = null;
function defaultState(){
  return { stats:{}, exp:0, coins:0, todayCount:0, todayDate:new Date().toDateString(),
    totalStudied:0, totalMastered:0, unlockedStage:0, activeStage:0, collection:[] };
}
function load(){
  try{ const raw = localStorage.getItem('wordOdysseySave'); state = raw ? JSON.parse(raw) : defaultState(); }
  catch(e){ state = defaultState(); }
  if(state.activeStage===undefined) state.activeStage = state.unlockedStage;
  if(state.todayDate !== new Date().toDateString()){ state.todayDate = new Date().toDateString(); state.todayCount = 0; }
  save();
}
function save(){ try{ localStorage.setItem('wordOdysseySave', JSON.stringify(state)); }catch(e){} }

function level(){ return Math.floor(state.exp/100)+1; }
function expForNext(){ return level()*100; }
function stageWords(s){ return WORDS.slice(s*STAGE_SIZE, s*STAGE_SIZE+STAGE_SIZE).map((w,i)=>({...w, idx:s*STAGE_SIZE+i})); }
function stageMasteredCount(s){ return stageWords(s).reduce((n,w)=>n+((state.stats[w.idx]||{}).mastered?1:0),0); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function formatMeaning(text){
  let n=0;
  return text.replace(/\s*(\[[^\]]+\])/g, (m,tag)=>{ n++; return n===1 ? tag : '<br>'+tag; });
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),1800); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function renderWorldCard(elId, badgeText, ratio){
  const el = document.getElementById(elId);
  const hills = ratio>=.5 ? "⛰️🏔️⛰️" : "⛰️";
  const trees = ratio>=.25 ? (ratio>=.75 ? "🌳🌲🌳🌲🌳" : "🌳 🌲 🌳") : "🌱 🌱";
  const city = ratio>=1 ? "🏰🏘️🏠🏘️🏰" : ratio>=.5 ? "🏠 🏡 🏠" : ratio>0 ? "⛺" : "";
  el.innerHTML = `
    <div class="sun"></div>
    <div class="cloud c1"></div><div class="cloud c2"></div>
    <div class="title">Word Odyssey</div>
    <div class="hillrow">${hills}</div>
    <div class="hillrow" style="bottom:56px;">${trees}</div>
    <div class="cityrow">${city}</div>
    <div class="badge">${badgeText}</div>`;
}

function showScreen(name){
  if(name==='study' && !session){
    toast('ホームの「学習をはじめる」から始めてね');
    return;
  }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.scr===name));
  if(name==='home') renderHome();
  if(name==='world') renderWorld();
  if(name==='collection') renderCollection();
  if(name==='menu') renderMenu();
}

function renderTopStat(prefix){
  document.getElementById(prefix+'Lv').textContent = 'Lv.'+level();
  document.getElementById(prefix+'ExpBar').style.width = Math.min(100,100*state.exp/expForNext())+'%';
  document.getElementById(prefix+'Diamond').textContent = state.totalMastered;
  document.getElementById(prefix+'Coin').textContent = state.coins;
}

function renderHome(){
  const s = state.activeStage;
  const ratio = stageMasteredCount(s)/STAGE_SIZE;
  renderTopStat('home');
  renderWorldCard('homeWorld', AREA_NAMES[s%AREA_NAMES.length]+' ・ '+(s*STAGE_SIZE+1)+'〜'+(s*STAGE_SIZE+stageWords(s).length)+'語', ratio);
  document.getElementById('homeToday').textContent = Math.min(state.todayCount,DAILY_GOAL)+' / '+DAILY_GOAL+'語';
  document.getElementById('homeTodayBar').style.width = Math.min(100,100*state.todayCount/DAILY_GOAL)+'%';
  document.getElementById('homeMascotLine').textContent = pick(MASCOT_LINES.home);
  renderWeak('homeWeakList', 10);
}

function selectStage(i){
  state.activeStage = i; save(); startSession();
}

function renderWorld(){
  const s = state.activeStage;
  renderWorldCard('worldBig', AREA_NAMES[s%AREA_NAMES.length], stageMasteredCount(s)/STAGE_SIZE);
  const list = document.getElementById('stageList'); list.innerHTML='';
  for(let i=0;i<NUM_STAGES;i++){
    const total = stageWords(i).length;
    const cnt = stageMasteredCount(i);
    const done = cnt>=total && total>0;
    const beyond = i>state.unlockedStage;
    const current = i===state.activeStage;
    const div = document.createElement('div');
    div.className = 'stagecard'+(beyond?' beyond':'')+(done?' done':'')+(current?' current':'');
    const range = (i*STAGE_SIZE+1)+'〜'+(i*STAGE_SIZE+total)+'語';
    div.innerHTML = `<div class="num">${i+1}</div><div style="flex:1"><b>${AREA_NAMES[i%AREA_NAMES.length]}</b><div class="small">${range}　${cnt} / ${total} 語 定着</div></div>${beyond?'<div class="small">🔍</div>':''}`;
    div.onclick = ()=>selectStage(i);
    list.appendChild(div);
  }
}

function renderCollection(){
  const total = Math.floor(state.totalMastered/UNLOCK_EVERY);
  document.getElementById('collectionCount').textContent = Math.min(total,COLLECTION_POOL.length)+' / '+COLLECTION_POOL.length+' 集めた';
  const g = document.getElementById('collectionGrid'); g.innerHTML='';
  COLLECTION_POOL.forEach((emoji,i)=>{
    const unlocked = i < total;
    const d = document.createElement('div');
    d.className = 'gitem'+(unlocked?'':' locked');
    d.innerHTML = `<div>${unlocked?emoji:'❔'}</div><div class="lbl">${unlocked?'':'未開放'}</div>`;
    g.appendChild(d);
  });
}

function renderWeak(elId, limit){
  const arr = Object.entries(state.stats).map(([idx,st])=>({idx:+idx, bad:(st.i||0)+(st.d||0)})).filter(x=>x.bad>0);
  arr.sort((a,b)=>b.bad-a.bad);
  const list = document.getElementById(elId); list.innerHTML='';
  if(arr.length===0){ list.innerHTML = '<div class="small">まだ苦手な単語はありません</div>'; return; }
  arr.slice(0,limit).forEach(x=>{
    const w = WORDS[x.idx];
    const d = document.createElement('div'); d.className='weak';
    d.innerHTML = `<span>${w.w}<br><span class="small">${formatMeaning(w.full)}</span></span><span class="badge">${x.bad}回</span>`;
    list.appendChild(d);
  });
}

function renderMenu(){
  document.getElementById('menuTotal').textContent = state.totalStudied+' 語';
  document.getElementById('menuMastered').textContent = state.totalMastered+' / '+WORDS.length;
  document.getElementById('menuLevel').textContent = level();
}

function resetGame(){
  if(confirm('本当にすべての学習データを削除しますか？この操作は取り消せません。')){
    state = defaultState(); save(); showScreen('home'); toast('データをリセットしました');
  }
}

// ---- study session ----
let session = null;
function startSession(){
  const s = state.activeStage;
  const words = stageWords(s);
  session = { stage:s, round:1, queue: shuffle(words.slice()), review:[], total: words.length, answered:0 };
  showScreen('study');
  nextQuestion();
}
function studyStageLabel(){
  return 'STAGE '+(session.stage+1)+'-'+session.round+' ｜ '+AREA_NAMES[session.stage%AREA_NAMES.length];
}
function nextQuestion(){
  document.getElementById('studyFeedback').textContent='';
  document.getElementById('studyNextBtn').style.display='none';
  if(!session) return showScreen('home');
  if(session.queue.length===0){
    if(session.review.length>0 && session.round<5){
      session.round++; session.queue = shuffle(session.review.slice()); session.review=[];
    } else { finishSession(); return; }
  }
  session.current = session.queue.shift();
  const w = session.current;
  document.getElementById('studyStage').textContent = studyStageLabel();
  document.getElementById('studyDiamond').textContent = state.totalMastered+' / '+WORDS.length;
  document.getElementById('qbarInner').style.width = Math.round(100*session.answered/session.total)+'%';
  document.getElementById('studyWord').textContent = w.w;
  const others = [];
  while(others.length<3){ const r = pick(WORDS); if(r.full!==w.full && !others.includes(r.full)) others.push(r.full); }
  const opts = shuffle([w.full,...others]);
  const box = document.getElementById('studyChoices'); box.innerHTML='';
  opts.forEach((opt)=>{
    const b=document.createElement('button'); b.className='choice plain';
    b.dataset.full = opt;
    b.innerHTML = formatMeaning(opt);
    b.onclick=()=>answer(opt===w.full, b); box.appendChild(b);
  });
  const dn=document.createElement('button'); dn.className='choice dunno plain'; dn.textContent='？　わからない';
  dn.onclick=()=>answer(null,dn); box.appendChild(dn);
}

function answer(correct, btnEl){
  const w = session.current;
  document.querySelectorAll('#studyChoices .choice').forEach(b=>{ b.onclick=null; });
  let st = state.stats[w.idx] || {c:0,i:0,d:0,hist:'',mastered:false};
  let kind, gainExp=0, gainCoin=0;
  if(correct===true){
    st.c++; st.hist=(st.hist+'O').slice(-5); kind='ok'; gainExp=10; gainCoin=5;
    btnEl.classList.add('correct');
  } else if(correct===false){
    st.i++; st.hist=(st.hist+'X').slice(-5); kind='ng';
    btnEl.classList.add('wrong');
    document.querySelectorAll('#studyChoices .choice').forEach(b=>{ if(b.dataset.full===w.full) b.classList.add('correct'); });
    session.review.push(w);
  } else {
    st.d++; st.hist=(st.hist+'D').slice(-5); kind='dk';
    btnEl.classList.add('wrong');
    document.querySelectorAll('#studyChoices .choice').forEach(b=>{ if(b.dataset.full===w.full) b.classList.add('correct'); });
    session.review.push(w);
  }
  let masteredNow=false;
  if(!st.mastered && st.hist.slice(-3)==='OOO'){ st.mastered=true; masteredNow=true; state.totalMastered++; gainExp+=30; }
  state.stats[w.idx]=st; state.exp+=gainExp; state.coins+=gainCoin;
  state.todayCount++; state.totalStudied++; session.answered++;
  save();
  if(masteredNow){
    if(state.totalMastered % UNLOCK_EVERY === 0) toast('🎁 新しいコレクションを獲得！');
    else toast('💎「'+w.w+'」が定着しました！');
  }
  const cfg = { ok:{cls:'ok', text:'正解！'}, ng:{cls:'ng', text:'不正解…'}, dk:{cls:'ng', text:'わからない'} }[kind];
  const fb = document.getElementById('studyFeedback');
  fb.innerHTML = cfg.text; fb.className = 'feedback '+cfg.cls;
  document.getElementById('studyNextBtn').style.display='block';
}

function finishSession(){
  const s = session.stage;
  const cleared = stageMasteredCount(s) >= stageWords(s).length;
  if(cleared && state.unlockedStage===s && s<NUM_STAGES-1){ state.unlockedStage++; save(); toast('🌟 新しいエリアが解放されました！'); }
  session = null; save();
  showScreen('home');
}

document.addEventListener('DOMContentLoaded', ()=>{ load(); showScreen('home'); });
