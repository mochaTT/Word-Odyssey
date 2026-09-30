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
    totalStudied:0, totalMastered:0, unlockedStage:0, activeStage:0, collection:[],
    splitMode:false, splitStats:{} };
}
function load(){
  try{ const raw = localStorage.getItem('wordOdysseySave'); state = raw ? JSON.parse(raw) : defaultState(); }
  catch(e){ state = defaultState(); }
  if(state.activeStage===undefined) state.activeStage = state.unlockedStage;
  if(state.splitMode===undefined) state.splitMode = false;
  if(!state.splitStats) state.splitStats = {};
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
// ---- 意味の分割（①②③…） ----
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const POS_TAGS = '自他名形副前接助動熟';
const _senseCache = {};
let _sensePool = null;

// full 文字列を「番号つきの意味」ごとに分割する。分割できない（番号が2つ未満）場合は null
function splitSenses(full){
  // 1) トークン化（括弧の外にある [品詞] と ①②… だけを区切りとして扱う）
  const toks = []; let depth = 0, buf = '';
  const flush = ()=>{ if(buf){ toks.push({t:'text', v:buf}); buf=''; } };
  for(let i=0;i<full.length;i++){
    const ch = full[i];
    if(ch==='('||ch==='（'){ depth++; buf+=ch; continue; }
    if(ch===')'||ch==='）'){ buf+=ch; if(depth>0) depth--; continue; }
    if(depth===0 && ch==='['){
      const m = /^\[([^\]]+)\]/.exec(full.slice(i));
      if(m && m[1].length===1 && POS_TAGS.includes(m[1])){ flush(); toks.push({t:'tag', v:m[0]}); i += m[0].length-1; continue; }
    }
    if(depth===0 && CIRC.includes(ch)){ flush(); toks.push({t:'num', n:CIRC.indexOf(ch)+1, v:ch}); continue; }
    buf+=ch;
  }
  flush();
  // 2) ①から順番に並んだ番号だけを「意味の区切り」とみなす（本文中の「第①の」などは無視）
  if(!toks.some(t=>t.t==='num' && t.n===1) && toks.some(t=>t.t==='num' && t.n===2)){
    toks.splice(toks[0] && toks[0].t==='tag' ? 1 : 0, 0, {t:'num', n:1, v:'①'}); // ①が省略されているケース
  }
  let expected = 1;
  toks.forEach(t=>{
    if(t.t==='num'){ if(t.n===expected){ t.marker=true; expected++; } else { t.t='text'; } }
  });
  if(expected-1 < 2) return null;
  // 3) 意味ごとに組み立てる
  const senses = []; let pos = '', lead = '', cur = null;
  const close = ()=>{ if(cur){ senses.push(cur); cur=null; } };
  toks.forEach(t=>{
    if(t.t==='tag'){ close(); pos=t.v; lead=''; }
    else if(t.t==='num' && t.marker){ close(); cur={no:t.n, pos, lead:lead.trim(), text:''}; }
    else { if(cur) cur.text+=t.v; else lead+=t.v; }
  });
  close();
  // 4) 末尾の「（①②ともに〈可算〉）」のような注記は全ての意味に付ける
  let note = '';
  const last = senses[senses.length-1];
  const nm = /\s*[（(]\s*[①-⑳]*\s*(ともに|いずれも)\s*([^）)]*)[）)]\s*$/.exec(last.text);
  if(nm){ note = '（'+nm[1]+nm[2]+'）'; last.text = last.text.slice(0, nm.index); }
  return senses.map(s=>{
    const body = ((s.lead? s.lead+' ' : '') + s.text.trim()).trim() + (note? ' '+note : '');
    return { no:s.no, text:(s.pos? s.pos+' ' : '') + body };
  });
}
function getSenses(idx){
  if(!(idx in _senseCache)) _senseCache[idx] = splitSenses(WORDS[idx].full);
  return _senseCache[idx];
}
// 出題単位を作る。split=true のとき、複数の意味をもつ単語は意味ごとに別の問題になる
function buildItems(words, split){
  const items = [];
  words.forEach(w=>{
    const ss = split ? getSenses(w.idx) : null;
    if(ss){ ss.forEach((s,k)=>items.push({...w, k, n:ss.length, key:w.idx+':'+k, choice:s.text})); }
    else items.push({...w, k:null, n:1, key:null, choice:w.full});
  });
  return items;
}
// 分割モードの選択肢（ダミー）用：全単語を意味1つ単位にしたプール
function getSensePool(){
  if(!_sensePool){
    _sensePool = [];
    WORDS.forEach((w,i)=>{
      const ss = getSenses(i);
      if(ss) ss.forEach(s=>_sensePool.push({idx:i, text:s.text}));
      else _sensePool.push({idx:i, text:w.full});
    });
  }
  return _sensePool;
}
function allSensesMastered(idx, n){
  for(let k=0;k<n;k++){ if(!(state.splitStats[idx+':'+k]||{}).mastered) return false; }
  return true;
}
function setMode(split){
  state.splitMode = !!split; save(); renderMode();
}
function renderMode(){
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('active', (b.dataset.mode==='split')===state.splitMode));
  const words = stageWords(state.activeStage);
  const desc = document.getElementById('homeModeDesc');
  if(state.splitMode){
    const n = buildItems(words, true).length;
    desc.textContent = '①②…と番号が付いた意味を1つずつ出題します（このエリア：'+words.length+'語 → '+n+'問）';
  } else {
    desc.textContent = '1語につき、すべての意味をまとめて出題します';
  }
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
  renderMode();
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
  const split = !!state.splitMode;
  const items = buildItems(words, split);
  session = { stage:s, round:1, queue: shuffle(items.slice()), review:[], total: items.length, answered:0, split };
  showScreen('study');
  nextQuestion();
}
function studyStageLabel(){
  return 'STAGE '+(session.stage+1)+'-'+session.round+' ｜ '+AREA_NAMES[session.stage%AREA_NAMES.length]+(session.split?' ｜ 分割':'');
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
  const isSense = w.k!==null;
  const badge = document.getElementById('studySense');
  badge.style.display = isSense ? 'inline-block' : 'none';
  if(isSense) badge.textContent = '意味 '+CIRC[w.k]+' ／ 全'+w.n+'つ';
  document.getElementById('studyPrompt').textContent = isSense
    ? 'この単語の意味のひとつとして正しいものを選んでください'
    : 'この単語の意味として最も近いものを選んでください';
  const others = [];
  if(session.split){
    const pool = getSensePool(); let guard = 0;
    while(others.length<3 && guard++<1000){ const r = pick(pool); if(r.idx!==w.idx && r.text!==w.choice && !others.includes(r.text)) others.push(r.text); }
  } else {
    while(others.length<3){ const r = pick(WORDS); if(r.full!==w.full && !others.includes(r.full)) others.push(r.full); }
  }
  const opts = shuffle([w.choice,...others]);
  const box = document.getElementById('studyChoices'); box.innerHTML='';
  opts.forEach((opt)=>{
    const b=document.createElement('button'); b.className='choice plain';
    b.dataset.full = opt;
    if(session.split) b.textContent = opt; else b.innerHTML = formatMeaning(opt);
    b.onclick=()=>answer(opt===w.choice, b); box.appendChild(b);
  });
  const dn=document.createElement('button'); dn.className='choice dunno plain'; dn.textContent='？　わからない';
  dn.onclick=()=>answer(null,dn); box.appendChild(dn);
}

function answer(correct, btnEl){
  const w = session.current;
  document.querySelectorAll('#studyChoices .choice').forEach(b=>{ b.onclick=null; });
  const isSense = w.k!==null;
  const blank = ()=>({c:0,i:0,d:0,hist:'',mastered:false});
  let st = isSense ? (state.splitStats[w.key]||blank()) : (state.stats[w.idx]||blank());
  let kind, gainExp=0, gainCoin=0;
  if(correct===true){
    st.c++; st.hist=(st.hist+'O').slice(-5); kind='ok'; gainExp=10; gainCoin=5;
    btnEl.classList.add('correct');
  } else if(correct===false){
    st.i++; st.hist=(st.hist+'X').slice(-5); kind='ng';
    btnEl.classList.add('wrong');
    document.querySelectorAll('#studyChoices .choice').forEach(b=>{ if(b.dataset.full===w.choice) b.classList.add('correct'); });
    session.review.push(w);
  } else {
    st.d++; st.hist=(st.hist+'D').slice(-5); kind='dk';
    btnEl.classList.add('wrong');
    document.querySelectorAll('#studyChoices .choice').forEach(b=>{ if(b.dataset.full===w.choice) b.classList.add('correct'); });
    session.review.push(w);
  }
  let masteredNow=false, senseNow=false;
  if(isSense){
    // 意味ごとの成績は splitStats に、正誤回数だけ単語側にも反映（苦手リスト用）
    const ws = state.stats[w.idx] || blank();
    if(kind==='ok') ws.c++; else if(kind==='ng') ws.i++; else ws.d++;
    state.splitStats[w.key]=st; state.stats[w.idx]=ws;
    if(!st.mastered && st.hist.slice(-3)==='OOO'){ st.mastered=true; senseNow=true; }
    // すべての意味が定着したら、その単語を「定着」とみなす
    if(!ws.mastered && allSensesMastered(w.idx, w.n)){ ws.mastered=true; masteredNow=true; state.totalMastered++; gainExp+=30; }
  } else {
    if(!st.mastered && st.hist.slice(-3)==='OOO'){ st.mastered=true; masteredNow=true; state.totalMastered++; gainExp+=30; }
    state.stats[w.idx]=st;
  }
  state.exp+=gainExp; state.coins+=gainCoin;
  state.todayCount++; state.totalStudied++; session.answered++;
  save();
  if(masteredNow){
    if(state.totalMastered % UNLOCK_EVERY === 0) toast('🎁 新しいコレクションを獲得！');
    else toast('💎「'+w.w+'」が定着しました！');
  } else if(senseNow){
    toast('✅「'+w.w+'」の意味'+CIRC[w.k]+'が定着！');
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
