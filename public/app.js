/* WordRadar · 考研词汇雷达
   艾宾浩斯调度：认识 → 间隔 1/2/4/7/15/30 天递进；模糊 → 2 天后重练；不认识 → 重置并重入今日队尾。
   进度仅存本机 localStorage；词库来自 ECDICT（见 data.js 与「备份」页）。 */

const STORE_KEY = 'wordRadar.v1';
const INTERVALS = [1, 2, 4, 7, 15, 30];   // stage k 通过后的下一个间隔（天）
const MASTER_STAGE = 6;

let state = { v: 1, words: {}, daily: {}, goal: 15, firstUse: Date.now() };
let session = { list: [], idx: 0, revealed: false, quiz: false };
let charts = {};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const WORDMAP = {};   // word -> index into WORDS.words

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2000);
}

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && raw.words) state = Object.assign(state, raw);
  } catch (e) { /* ignore */ }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- 今日队列 ----------
function todayQueue() {
  const today = todayStr();
  const due = Object.keys(state.words)
    .filter((w) => state.words[w].stage < MASTER_STAGE && state.words[w].next <= today)
    .sort((a, b) => (state.words[a].next < state.words[b].next ? -1 : 1))
    .map((w) => ({ w, isNew: false }));
  const learnedToday = (state.daily[today] || {}).new || 0;
  const freshN = Math.max(0, state.goal - learnedToday);
  const fresh = WORDS.words.filter((r) => !(r.w in state.words)).slice(0, freshN)
    .map((r) => ({ w: r.w, isNew: true }));
  return [...due, ...fresh];
}

function rate(word, rateKind) {
  const today = todayStr();
  const rec = state.words[word] || { stage: 0, next: today, seen: 0, ok: 0, bad: 0, last: 0 };
  const day = state.daily[today] || (state.daily[today] = { new: 0, review: 0 });
  if (rateKind === 2) {          // 认识
    rec.stage = Math.min(rec.stage + 1, MASTER_STAGE);
    rec.next = addDays(today, INTERVALS[Math.min(rec.stage - 1, INTERVALS.length - 1)]);
    rec.ok += 1;
    day.review += 1;
  } else if (rateKind === 1) {   // 模糊
    rec.next = addDays(today, 2);
    day.review += 1;
  } else {                        // 不认识
    rec.stage = 0;
    rec.next = today;
    rec.bad += 1;
    day.review += 1;
  }
  rec.seen += 1;
  rec.last = Date.now();
  state.words[word] = rec;
  saveState();
}

function streak() {
  let n = 0;
  let d = todayStr();
  if (!((state.daily[d] || {}).new || (state.daily[d] || {}).review)) d = todayStr(-1);
  while ((state.daily[d] || {}).new || (state.daily[d] || {}).review) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- 渲染：今日 ----------
function renderToday() {
  if (!session.list.length) session.list = todayQueue();
  const remaining = session.list.slice(session.idx);
  const totalToday = remaining.length;
  const doneToday = ((state.daily[todayStr()] || {}).new || 0) + ((state.daily[todayStr()] || {}).review || 0);
  const pct = totalToday + doneToday ? Math.min(100, doneToday / (doneToday + totalToday) * 100) : 100;
  $('queueFill').style.width = pct + '%';
  $('queueMeta').textContent = `剩余 ${totalToday} 张 · 今日已学 ${doneToday}`;
  $('goalMeta').textContent = `每日新词目标 ${state.goal}`;
  $('streakNum').textContent = streak();

  const card = remaining[0];
  if (!card) {
    $('cardEmpty').hidden = false;
    $('cardBody').hidden = true;
    return;
  }
  $('cardEmpty').hidden = true;
  $('cardBody').hidden = false;
  const info = WORDS.words[WORDMAP[card.w]];
  $('cardWord').textContent = info.w;
  $('cardPhon').textContent = info.p ? '/' + info.p + '/' : '';
  const freqBits = [];
  if (info.frq) freqBits.push('COCA #' + info.frq);
  if (info.ox) freqBits.push('牛津核心');
  if (info.cl) freqBits.push('Collins ' + info.cl + '星');
  $('cardFreq').textContent = freqBits.join(' · ');
  $('cardTrans').textContent = session.revealed ? (info.t || '（无释义）') : '点击下方按钮显示释义';
  const rec = state.words[card.w];
  $('cardStage').textContent = rec
    ? `第 ${rec.stage >= MASTER_STAGE ? MASTER_STAGE : rec.stage + 1} 轮 · 已见 ${rec.seen} 次`
    : '新词 · 第 1 轮';
  $('btnShow').hidden = session.revealed;
  $('rateRow').hidden = !session.revealed;
}

function advance(rateKind) {
  const card = session.list[session.idx];
  if (!card) return;
  rate(card.w, rateKind);
  if (rateKind === 0) {
    session.list.push(card);          // 不认识：重入队尾，当日再见
  }
  session.idx += 1;
  session.revealed = false;
  if (session.idx >= session.list.length) session.list = todayQueue(), session.idx = 0;
  renderToday();
}

// ---------- 测验模式 ----------
function startQuiz() {
  const remaining = session.list.slice(session.idx).slice(0, 10);
  if (!remaining.length) { toast('今日队列已完成'); return; }
  session.quiz = true;
  session.quizList = remaining;
  session.quizIdx = 0;
  renderQuiz();
}

function renderQuiz() {
  const q = session.quizList[session.quizIdx];
  if (!q) { session.quiz = false; renderToday(); return; }
  const info = WORDS.words[WORDMAP[q.w]];
  const correct = (info.t || '').split(/[；;]/)[0].slice(0, 40) || info.t;
  const pool = WORDS.words.filter((r) => r.w !== q.w);
  const opts = [correct];
  while (opts.length < 4) {
    const cand = (pool[Math.floor(Math.random() * pool.length)].t || '').split(/[；;]/)[0].slice(0, 40);
    if (cand && !opts.includes(cand)) opts.push(cand);
  }
  opts.sort(() => Math.random() - 0.5);
  $('cardTrans').innerHTML =
    `<b>测验 ${session.quizIdx + 1}/${session.quizList.length}</b>：选出「${esc(info.w)}」的正确释义<div class="quiz-opts">` +
    opts.map((o, i) => `<button class="btn ghost quiz-opt" data-ok="${o === correct ? 1 : 0}">${esc(o)}</button>`).join('') +
    `</div>`;
  $('btnShow').hidden = true;
  $('rateRow').hidden = true;
  document.querySelectorAll('.quiz-opt').forEach((b) => {
    b.onclick = () => {
      const ok = b.dataset.ok === '1';
      b.style.outline = '3px solid ' + (ok ? 'var(--good)' : 'var(--danger)');
      rate(q.w, ok ? 2 : 0);
      session.quizIdx += 1;
      setTimeout(renderQuiz, 550);
    };
  });
  $('cardStage').textContent = '测验模式：选错将按“不认识”处理';
}

// ---------- 渲染：词库 ----------
const PAGE = 60;
let pageIdx = 0;
function renderWords(reset) {
  const q = $('wSearch').value.trim().toLowerCase();
  const f = $('wFilter').value;
  const sort = $('wSort').value;
  let list = WORDS.words.filter((r) => {
    if (q && !r.w.toLowerCase().includes(q)) return false;
    const rec = state.words[r.w];
    if (f === 'new') return !rec;
    if (f === 'learning') return rec && rec.stage < MASTER_STAGE;
    if (f === 'mastered') return rec && rec.stage >= MASTER_STAGE;
    return true;
  });
  list.sort((a, b) => sort === 'az' ? a.w.localeCompare(b.w) : (a.frq || 99999) - (b.frq || 99999));
  $('wStats').textContent = `共 ${WORDS.count} 词 · 当前显示 ${shown} / ${list.length}`;
  const shown = Math.min((reset ? 1 : pageIdx + 1) * PAGE, list.length);
  const show = list.slice(0, shown);
  $('wordList').innerHTML = show.map((r) => {
    const rec = state.words[r.w];
    const tag = !rec ? '' : rec.stage >= MASTER_STAGE
      ? '<span class="w-tag" style="background:var(--good)">已掌握</span>'
      : `<span class="w-tag" style="background:var(--warn)">第${rec.stage + 1}轮</span>`;
    return `<div class="word-item">
      <div class="w-row"><span class="w-word">${esc(r.w)}</span>${r.p ? `<span class="w-phon">/${esc(r.p)}/</span>` : ''}${tag}
      ${r.frq ? `<span class="w-phon" style="margin-left:auto">COCA #${r.frq}</span>` : ''}</div>
      <div class="w-trans">${esc((r.t || '').slice(0, 80))}</div>
    </div>`;
  }).join('');
  if (list.length > shown) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost block';
    btn.textContent = `加载更多（已显示 ${shown} / ${list.length}）`;
    btn.onclick = () => { pageIdx += 1; renderWords(false); };
    $('wordList').appendChild(btn);
  }
  if (!list.length) $('wordList').innerHTML = '<div class="empty">没有匹配的单词</div>';
}

// ---------- 渲染：看板 ----------
function renderBoard() {
  const learned = Object.keys(state.words);
  const mastered = learned.filter((w) => state.words[w].stage >= MASTER_STAGE).length;
  const learning = learned.length - mastered;
  $('boardStats').innerHTML = `
    <div class="summary-item"><b>${WORDS.count}</b><span>考研词库</span></div>
    <div class="summary-item"><b>${learned.length}</b><span>已学习</span></div>
    <div class="summary-item"><b>${mastered}</b><span>已掌握</span></div>`;
  ensureChart('daily', $('chartDaily'));
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(todayStr(-i));
  const news = days.map((d) => (state.daily[d] || {}).new || 0);
  const revs = days.map((d) => (state.daily[d] || {}).review || 0);
  charts.daily.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: { left: 34, right: 12, top: 30, bottom: 26 },
    xAxis: { type: 'category', data: days.map((d) => d.slice(5)), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [
      { name: '新学', type: 'bar', stack: 's', data: news, itemStyle: { color: '#4F6EF2' }, barMaxWidth: 14 },
      { name: '复习', type: 'bar', stack: 's', data: revs, itemStyle: { color: '#10B981' }, barMaxWidth: 14 },
    ],
  }, { notMerge: true });
  ensureChart('dist', $('chartDist'));
  charts.dist.setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['45%', '72%'],
      data: [
        { name: '未学', value: WORDS.count - learned.length, itemStyle: { color: '#9AA5B1' } },
        { name: '学习中', value: learning, itemStyle: { color: '#F59E0B' } },
        { name: '已掌握', value: mastered, itemStyle: { color: '#10B981' } },
      ],
      label: { fontSize: 11, formatter: '{b} {c}' },
    }],
  }, { notMerge: true });
}

function ensureChart(key, el) {
  if (!charts[key]) charts[key] = echarts.init(el);
  return charts[key];
}

// ---------- 备份 ----------
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wordradar-backup-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (!obj.words) throw new Error('缺少 words 字段');
      state = Object.assign({ v: 1, words: {}, daily: {}, goal: 15, firstUse: Date.now() }, obj);
      saveState();
      renderToday();
      toast('导入成功');
    } catch (e) { toast('导入失败：' + e.message); }
  };
  r.readAsText(file);
}

// ---------- 路由与初始化 ----------
function switchTab(name) {
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  requestAnimationFrame(() => {
    if (name === 'today') renderToday();
    if (name === 'words') renderWords(true);
    if (name === 'board') renderBoard();
    if (name === 'backup') $('goalSel').value = String(state.goal);
  });
}

function init() {
  if (!window.WORDS || !window.WORDS.words) {
    $('main').innerHTML = '<div class="card"><div class="card-title">词库未加载</div><p class="hint">data.js 缺失或为空。</p></div>';
    return;
  }
  WORDS.words.forEach((r, i) => { WORDMAP[r.w] = i; });
  $('dataMeta').textContent = `词库 ${WORDS.count} 词 · 更新于 ${WORDS.updated}`;
  loadState();
  renderToday();

  document.querySelectorAll('#tabbar button').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('btnShow').onclick = () => { session.revealed = true; renderToday(); };
  document.querySelectorAll('.rate').forEach((b) =>
    b.onclick = () => advance(+b.dataset.rate));
  $('btnSpeak').onclick = () => {
    const u = new SpeechSynthesisUtterance($('cardWord').textContent);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  };
  $('btnQuiz').onclick = () => { session.quiz = true; startQuiz(); };
  $('btnMore').onclick = () => {
    session.list = todayQueue();
    const today = todayStr();
    state.daily[today] = state.daily[today] || { new: 0, review: 0 };
    session.idx = 0;
    // 加学：把目标外的新词追加 10 个
    const extra = WORDS.words.filter((r) => !(r.w in state.words) && !session.list.some((c) => c.w === r.w)).slice(0, 10)
      .map((r) => ({ w: r.w, isNew: true }));
    session.list.push(...extra);
    renderToday();
    toast('已加学 10 个新词');
  };
  $('wSearch').addEventListener('input', () => renderWords(true));
  $('wFilter').addEventListener('change', () => renderWords(true));
  $('wSort').addEventListener('change', () => renderWords(true));
  $('goalSel').addEventListener('change', (e) => { state.goal = +e.target.value; saveState(); toast('已保存'); });
  $('btnExport').onclick = exportData;
  $('btnImportBtn').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  $('btnClear').onclick = () => {
    if (confirm('确定清空全部学习进度吗？此操作不可恢复，建议先导出备份。')) {
      state.words = {}; state.daily = {};
      saveState(); renderToday(); toast('已清空');
    }
  };
  window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));
}

init();
