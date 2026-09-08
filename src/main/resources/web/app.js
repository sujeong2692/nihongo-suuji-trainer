/* 일본어 숫자 집중 암기 - frontend (vanilla JS, no build step) */
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const STATUS_KO = { new: '미학습', learning: '학습 중', mastered: '마스터' };
  const CATEGORY_LABEL = {
    all: '전체', basic: '기초 한자어 수사', wago: '고유어 수사', place: '자릿수',
    counter: '조수사(助数詞)', date: '날짜', time: '시간', age: '나이',
  };
  const SUB_LABEL = {
    onyomi: '한자어(音読み)', native: '고유어', sai: '~세',
    juu: '십(十)', hyaku: '백(百)', sen: '천(千)', man: '만(万)',
    hon: '本 - 가늘고 긴 것', mai: '枚 - 얇고 평평한 것', hiki: '匹 - 작은 동물',
    satsu: '冊 - 책', dai: '台 - 기계·차량', 'kai-floor': '階 - 층',
    hai: '杯 - 잔·컵', 'kai-times': '回 - 횟수', hito: '人 - 사람',
    wa: '羽 - 새·토끼', tou: '頭 - 큰 동물', ko: '個 - 개',
    soku: '足 - 신발 켤레', ken: '軒 - 집·건물',
    day: '일(日)', month: '월(月)', weekday: '요일',
    hour: '시(時)', minute: '분(分)', second: '초(秒)',
  };
  function subLabel(sub) { return SUB_LABEL[sub] || sub; }

  // ------------------------------------------------------------------ utils
  async function api(path, params, method = 'GET') {
    const opts = { method };
    let url = '/api' + path;
    if (method === 'GET') {
      if (params) url += '?' + new URLSearchParams(params);
    } else {
      opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      opts.body = new URLSearchParams(params || {}).toString();
    }
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function badgesHtml(it) {
    const p = it.progress;
    let html = `<span class="badge">${esc(CATEGORY_LABEL[it.category] || it.category)}</span><span class="badge">${esc(subLabel(it.subcategory))}</span>`;
    if (it.irregular) html += `<span class="badge irregular">불규칙</span>`;
    if (p) {
      html += `<span class="badge st-${p.status}">${STATUS_KO[p.status]}</span>`;
      if (p.isDue) html += `<span class="badge due">오늘 복습</span>`;
    }
    return html;
  }
  function progressLine(p) {
    if (!p || p.seen === 0) return '아직 학습하지 않은 항목입니다.';
    const due = p.dueIn <= 0 ? '오늘' : `${p.due} (${p.dueIn}일 후)`;
    return `복습 ${p.seen}회 · 정답 ${p.correct} · 오답 ${p.wrong} · 간격 ${p.interval}일 · 다음 복습 ${due}`;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // ------------------------------------------------------------------ catalog (categories/subcategories)
  let CATALOG = null;
  async function loadCatalog() {
    if (CATALOG) return CATALOG;
    CATALOG = await api('/categories');
    return CATALOG;
  }

  function fillCatSelects() {
    $$('.cat-select').forEach(sel => {
      const opts = ['<option value="all">전체</option>'];
      for (const c of CATALOG.categories) {
        opts.push(`<option value="${c.category}">${esc(CATEGORY_LABEL[c.category] || c.category)} (${c.total})</option>`);
      }
      sel.innerHTML = opts.join('');
      const sub = document.getElementById(sel.id.replace('-cat', '-sub'));
      if (sub) {
        sel.addEventListener('change', () => fillSubSelect(sel, sub));
        fillSubSelect(sel, sub);
      }
    });
  }

  function fillSubSelect(catSel, subSel) {
    if (!subSel) return;
    const cat = catSel.value;
    const subs = CATALOG.subcategories.filter(s => cat === 'all' || s.category === cat);
    const opts = ['<option value="all">전체</option>'];
    for (const s of subs) opts.push(`<option value="${s.subcategory}">${esc(subLabel(s.subcategory))} (${s.total})</option>`);
    subSel.innerHTML = opts.join('');
  }

  // ------------------------------------------------------------------ router
  const onShow = {};
  let currentView = '';
  function route() {
    const h = location.hash.slice(1) || 'dash';
    const [view, qs] = h.split('?');
    const params = new URLSearchParams(qs || '');
    const target = $('#view-' + view) ? view : 'dash';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + target));
    $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === target));
    currentView = target;
    closeModal();
    loadCatalog().then(() => { if (onShow[target]) onShow[target](params); });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ modal
  function openModal(html) {
    $('#modal-box').innerHTML = html;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  async function openDetail(id) {
    let it;
    try { it = await api('/items/' + encodeURIComponent(id)); } catch (e) { toast(e.message); return; }
    openModal(`
      <button class="modal-close link" data-act="close">닫기 ✕</button>
      <div class="detail">
        <div class="detail-big" lang="ja">${esc(it.prompt)}</div>
        <div>${badgesHtml(it)}</div>
        <div class="rd" lang="ja"><span class="lbl on">읽기</span><span>${esc(it.reading)}</span></div>
        <div class="korean">${esc(it.korean)}</div>
        ${it.note ? `<div class="note-line">${esc(it.note)}</div>` : ''}
        <div class="prog">${progressLine(it.progress)}</div>
        <div class="actions">
          <button data-act="write">받아쓰기 연습</button>
          <button data-act="mastered">아는 항목으로 표시</button>
          <button data-act="reset">진도 초기화</button>
        </div>
      </div>`);
    $('#modal-box').onclick = async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') closeModal();
      else if (act === 'write') { closeModal(); location.hash = 'write'; setWriteMode('item'); }
      else if (act === 'mastered' || act === 'reset') {
        await api('/progress/mark', { id: it.id, status: act }, 'POST');
        toast(act === 'mastered' ? `마스터로 표시했습니다` : `진도를 초기화했습니다`);
        openDetail(it.id);
        if (currentView === 'list') list.load();
      }
    };
  }

  // ------------------------------------------------------------------ dashboard
  async function renderDash() {
    let s;
    try { s = await api('/stats'); } catch (e) { toast(e.message); return; }
    $('#d-total').textContent = s.total.total;
    $('#d-mastered').textContent = s.total.mastered;
    $('#d-learning').textContent = s.total.learning;
    $('#d-due').textContent = s.total.due;
    $('#d-today').textContent = s.reviewedToday;
    $('#cat-rows').innerHTML = s.categories.map(c => {
      const pm = (c.mastered / c.total * 100).toFixed(1), pl = (c.learning / c.total * 100).toFixed(1);
      return `<div class="grow">
        <div class="g-label">${esc(c.label)}</div>
        <div>
          <div class="g-bar"><i class="m" style="width:${pm}%"></i><i class="l" style="width:${pl}%"></i></div>
          <div class="g-nums"><b>${c.mastered}</b> 마스터 · <b>${c.learning}</b> 학습 중 · <b>${c.new}</b> 미학습 / ${c.total}개
            ${c.due ? ` · <span style="color:var(--due)">복습 ${c.due}</span>` : ''}</div>
        </div>
        <div class="g-actions">
          <button class="small primary" data-go="flash?category=${c.category}&auto=1">학습</button>
          <button class="small" data-go="list?category=${c.category}">사전</button>
          <button class="small" data-mark="${c.category}" title="이 카테고리의 모든 항목을 아는 것으로 표시">전부 아는 항목</button>
        </div>
      </div>`;
    }).join('');
  }
  $('#cat-rows').addEventListener('click', async e => {
    const go = e.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; return; }
    const mark = e.target.closest('[data-mark]');
    if (mark) {
      const label = CATEGORY_LABEL[mark.dataset.mark] || mark.dataset.mark;
      if (!confirm(`${label}의 모든 항목을 '아는 항목(마스터)'으로 표시할까요?`)) return;
      await api('/progress/mark', { category: mark.dataset.mark, status: 'mastered' }, 'POST');
      toast(`${label} 전체를 마스터로 표시했습니다`);
      renderDash();
    }
  });
  $('#dash-review-all').addEventListener('click', () => { location.hash = 'flash?category=all&auto=1'; });

  async function dashReadNumber() {
    const raw = $('#dash-bignum-input').value.trim().replace(/,/g, '');
    if (!raw || !/^\d+$/.test(raw)) { toast('숫자를 입력하세요'); return; }
    let d;
    try { d = await api('/bignum/read', { number: raw }); } catch (e) { toast(e.message); return; }
    $('#dash-bignum-result').classList.remove('hidden');
    $('#dash-bignum-result').innerHTML = `
      <div class="display">${esc(d.display)}</div>
      <div class="reading" lang="ja">${esc(d.reading)}</div>
      <div class="steps">${d.breakdown.map(s => `<div>${esc(s)}</div>`).join('')}</div>`;
  }
  $('#dash-bignum-go').addEventListener('click', dashReadNumber);
  $('#dash-bignum-input').addEventListener('keydown', e => { if (e.key === 'Enter') dashReadNumber(); });
  $('#dash-bignum-quiz').addEventListener('click', () => { location.hash = 'quiz'; setTimeout(() => setQuizMode('bignum'), 0); });
  $('#dash-bignum-write').addEventListener('click', () => { location.hash = 'write'; setTimeout(() => setWriteMode('bignum'), 0); });
  onShow.dash = renderDash;

  // ------------------------------------------------------------------ list
  const list = { category: 'all', subcategory: 'all', status: 'all', q: '', timer: null };
  list.load = async function () {
    const grid = $('#list-grid');
    grid.innerHTML = '<div class="empty">불러오는 중…</div>';
    let data;
    try { data = await api('/items', { category: list.category, subcategory: list.subcategory, status: list.status, q: list.q }); }
    catch (e) { grid.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    $('#list-count').textContent = `${data.total}개`;
    if (!data.items.length) { grid.innerHTML = '<div class="empty">조건에 맞는 항목이 없습니다.</div>'; return; }
    grid.innerHTML = data.items.map(it => `
      <button class="tile st-${it.progress.status}${it.progress.isDue ? ' is-due' : ''}${it.irregular ? ' is-irregular' : ''}" data-id="${esc(it.id)}" title="${esc(it.korean)}">
        <span class="k" lang="ja">${esc(it.prompt)}</span><span class="r" lang="ja">${esc(it.reading)}</span><span class="m">${esc(it.korean)}</span>
      </button>`).join('');
  };
  function renderListChips() {
    const cats = ['all', ...CATALOG.categories.map(c => c.category)];
    $('#list-cats').innerHTML = cats.map(c => `<button class="chip${c === list.category ? ' active' : ''}" data-c="${c}">${esc(CATEGORY_LABEL[c] || c)}</button>`).join('');
  }
  $('#list-cats').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    list.category = c.dataset.c;
    list.subcategory = 'all';
    renderListChips();
    fillSubSelect({ value: list.category }, $('#list-sub'));
    $('#list-sub').value = 'all';
    list.load();
  });
  $('#list-sub').addEventListener('change', e => { list.subcategory = e.target.value; list.load(); });
  $('#list-status').addEventListener('change', e => { list.status = e.target.value; list.load(); });
  $('#list-q').addEventListener('input', e => {
    clearTimeout(list.timer);
    list.timer = setTimeout(() => { list.q = e.target.value; list.load(); }, 250);
  });
  $('#list-grid').addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (t) openDetail(t.dataset.id);
  });
  onShow.list = params => {
    if (params.has('category')) list.category = params.get('category');
    renderListChips();
    fillSubSelect({ value: list.category }, $('#list-sub'));
    $('#list-status').value = list.status;
    list.load();
  };

  // ------------------------------------------------------------------ flashcards
  const flash = { queue: [], done: 0, front: 'prompt', again: 0, ok: 0, active: false, cur: null, flipped: false };

  function previewIntervals(it) {
    const p = it.progress || { reps: 0, interval: 0, ease: 2.5 };
    const next = q => {
      const reps = p.reps + 1;
      if (reps === 1) return q === 5 ? 4 : 1;
      if (reps === 2) return 6;
      return Math.max(p.interval + 1, Math.round(p.interval * p.ease));
    };
    $('#iv-hard').textContent = `${next(3)}일 후`;
    $('#iv-good').textContent = `${next(4)}일 후`;
    $('#iv-easy').textContent = `${next(5)}일 후`;
  }

  async function flashStart(opts) {
    const category = opts?.category ?? $('#flash-cat').value;
    const subcategory = $('#flash-sub').value;
    const limit = $('#flash-limit').value, nw = $('#flash-new').value;
    flash.front = $('#flash-front').value;
    let data;
    try { data = await api('/review/next', { category, subcategory, limit, new: nw }); } catch (e) { toast(e.message); return; }
    if (!data.items.length) {
      $('#flash-info').textContent = data.newTotal === 0 ? '이 범위의 항목을 모두 학습했고 오늘 복습할 카드도 없습니다. 🎉'
        : '오늘 복습할 카드가 없습니다. "새 항목" 수를 0보다 크게 설정하면 새 항목을 학습할 수 있습니다.';
      return;
    }
    Object.assign(flash, { queue: data.items, done: 0, again: 0, ok: 0, active: true });
    $('#flash-settings').classList.add('hidden');
    $('#flash-done').classList.add('hidden');
    $('#flash-stage').classList.remove('hidden');
    $('#flash-info').textContent = `복습 ${data.dueTotal}개 · 새 항목 ${data.newTotal}개가 남아 있습니다.`;
    flashNext();
  }

  function flashNext() {
    if (!flash.queue.length) { flashFinish(); return; }
    flash.cur = flash.queue.shift();
    flash.flipped = false;
    const it = flash.cur, p = it.progress;
    const total = flash.done + flash.queue.length + 1;
    $('#flash-bar').style.width = (flash.done / total * 100) + '%';
    $('#flash-pos').textContent = `${flash.done + 1} / ${total}`;
    $('#flash-tag').textContent = it.requeued ? '재출제' : p.seen === 0 ? '새 항목' : `복습 (${p.status === 'mastered' ? '마스터' : '학습 중'})`;
    const front = $('#fcard-front');
    if (flash.front === 'prompt') front.innerHTML = `<div class="big" lang="ja">${esc(it.prompt)}</div>`;
    else front.innerHTML = `<div class="front-reading"><div class="reading-big" lang="ja">${esc(it.reading)}</div></div>`;
    front.classList.remove('hidden');
    $('#fcard-back').classList.add('hidden');
    $('#flash-flip-row').classList.remove('hidden');
    $('#flash-rate-row').classList.add('hidden');
  }

  function flashFlip() {
    if (flash.flipped || !flash.active) return;
    flash.flipped = true;
    const it = flash.cur;
    $('#fcard-front').classList.add('hidden');
    $('#fcard-back').innerHTML = `<div class="back">
        <div class="big" lang="ja">${flash.front === 'prompt' ? esc(it.reading) : esc(it.prompt)}</div>
        <div>
          <div>${badgesHtml(it)}</div>
          <div class="korean">${esc(it.korean)}</div>
          ${it.note ? `<div class="note-line">${esc(it.note)}</div>` : ''}
          <div class="hist">${progressLine(it.progress)}</div>
        </div></div>`;
    $('#fcard-back').classList.remove('hidden');
    $('#flash-flip-row').classList.add('hidden');
    $('#flash-rate-row').classList.remove('hidden');
    previewIntervals(it);
  }

  async function flashRate(q) {
    if (!flash.flipped || !flash.active) return;
    const it = flash.cur;
    flash.flipped = false;
    let res;
    try { res = await api('/review', { id: it.id, q }, 'POST'); } catch (e) { toast(e.message); return; }
    it.progress = res.progress;
    if (q < 3) {
      flash.again++;
      it.requeued = true;
      flash.queue.splice(Math.min(3, flash.queue.length), 0, it);
    } else {
      flash.ok++;
      flash.done++;
    }
    flashNext();
  }

  function flashFinish() {
    flash.active = false;
    $('#flash-stage').classList.add('hidden');
    $('#flash-done').classList.remove('hidden');
    $('#flash-done').innerHTML = `<h2>세션 완료 🎉</h2>
      <p>${flash.done}개 학습 · 성공 ${flash.ok}회 · 다시 ${flash.again}회</p>
      <div class="actions"><button class="primary" id="flash-more">계속 학습</button><button id="flash-settings-btn">설정으로</button></div>`;
    $('#flash-more').onclick = () => flashStart();
    $('#flash-settings-btn').onclick = () => { $('#flash-done').classList.add('hidden'); $('#flash-settings').classList.remove('hidden'); };
  }

  $('#flash-start').addEventListener('click', () => flashStart());
  $('#flash-flip').addEventListener('click', flashFlip);
  $('#fcard').addEventListener('click', flashFlip);
  $('#flash-rate-row').addEventListener('click', e => {
    const b = e.target.closest('button[data-q]');
    if (b) flashRate(Number(b.dataset.q));
  });
  $('#flash-quit').addEventListener('click', () => { flash.queue = []; flashFinish(); });
  onShow.flash = params => {
    if (params.has('category')) $('#flash-cat').value = params.get('category');
    fillSubSelect($('#flash-cat'), $('#flash-sub'));
    if (params.get('auto') === '1' && !flash.active) flashStart({ category: params.get('category') });
  };

  // ------------------------------------------------------------------ item quiz
  const quiz = { qs: [], i: 0, score: 0, mode: 'reading', answered: false, wrong: [], active: false };

  function setQuizMode(mode) {
    $$('.qmode').forEach(b => b.classList.toggle('active', b.dataset.qmode === mode));
    $('#quiz-settings').classList.toggle('hidden', mode !== 'item');
    $('#bignum-quiz-settings').classList.toggle('hidden', mode !== 'bignum');
    $('#quiz-stage').classList.add('hidden');
    $('#quiz-done').classList.add('hidden');
  }
  $$('.qmode').forEach(b => b.addEventListener('click', () => setQuizMode(b.dataset.qmode)));

  async function quizStart() {
    const category = $('#quiz-cat').value, subcategory = $('#quiz-sub').value, mode = $('#quiz-mode').value,
      n = $('#quiz-n').value, pool = $('#quiz-pool').value;
    let data;
    try { data = await api('/quiz', { category, subcategory, mode, n, pool }); } catch (e) { toast(e.message); return; }
    Object.assign(quiz, { qs: data.questions, i: 0, score: 0, mode, wrong: [], active: true, answered: false, kind: 'item' });
    $('#quiz-settings').classList.add('hidden');
    $('#bignum-quiz-settings').classList.add('hidden');
    $('#quiz-done').classList.add('hidden');
    $('#quiz-stage').classList.remove('hidden');
    quizRender();
  }

  async function bignumQuizStart() {
    const level = $('#bignum-level').value, n = $('#bignum-n').value;
    let data;
    try { data = await api('/bignum/quiz', { level, n }); } catch (e) { toast(e.message); return; }
    const qs = data.questions.map(q => ({ prompt: q.display, choices: q.choices, answer: q.answer, number: q.number }));
    Object.assign(quiz, { qs, i: 0, score: 0, mode: 'bignum', wrong: [], active: true, answered: false, kind: 'bignum' });
    $('#quiz-settings').classList.add('hidden');
    $('#bignum-quiz-settings').classList.add('hidden');
    $('#quiz-done').classList.add('hidden');
    $('#quiz-stage').classList.remove('hidden');
    quizRender();
  }

  function quizRender() {
    const q = quiz.qs[quiz.i];
    quiz.answered = false;
    $('#quiz-bar').style.width = (quiz.i / quiz.qs.length * 100) + '%';
    $('#quiz-pos').textContent = `${quiz.i + 1} / ${quiz.qs.length}`;
    $('#quiz-score').textContent = `정답 ${quiz.score}`;
    const prompt = $('#quiz-prompt');
    if (quiz.kind === 'bignum') {
      prompt.innerHTML = `<div class="big">${esc(q.prompt)}</div><div class="sub">이 숫자를 히라가나로 읽으면?</div>`;
    } else if (quiz.mode === 'reading') {
      prompt.innerHTML = `<div class="big" lang="ja">${esc(q.prompt)}</div><div class="sub">이 표현의 올바른 읽기는?</div>`;
    } else {
      prompt.innerHTML = `<div class="big" lang="ja">${esc(q.prompt)}</div><div class="sub">이 읽기에 해당하는 표현은?</div>`;
    }
    $('#quiz-choices').innerHTML = q.choices.map((c, i) => `
      <button class="choice" data-i="${i}" lang="ja">
        <span class="idx">${i + 1}</span><span>${esc(c)}</span>
      </button>`).join('');
    $('#quiz-reveal').classList.add('hidden');
    $('#quiz-next').classList.add('hidden');
  }

  async function quizAnswer(i) {
    if (quiz.answered || !quiz.active) return;
    quiz.answered = true;
    const q = quiz.qs[quiz.i];
    const correct = i === q.answer;
    if (correct) quiz.score++; else quiz.wrong.push(q);
    $$('#quiz-choices .choice').forEach(b => {
      b.disabled = true;
      const bi = Number(b.dataset.i);
      if (bi === q.answer) b.classList.add('correct');
      else if (bi === i) b.classList.add('wrong');
    });
    $('#quiz-score').textContent = `정답 ${quiz.score}`;
    if (quiz.kind === 'bignum') {
      $('#quiz-reveal').innerHTML = `<div class="big">${esc(q.prompt)} = <span lang="ja">${esc(q.choices[q.answer])}</span></div>`;
    } else {
      const it = q.item;
      $('#quiz-reveal').innerHTML = `<div class="big" lang="ja">${esc(it.prompt)} / ${esc(it.reading)}</div><div>${badgesHtml(it)}</div><div class="korean">${esc(it.korean)}</div>${it.note ? `<div class="note-line">${esc(it.note)}</div>` : ''}`;
      api('/quiz/answer', { id: it.id, correct }, 'POST').catch(e => toast(e.message));
    }
    $('#quiz-reveal').classList.remove('hidden');
    $('#quiz-next').classList.remove('hidden');
    $('#quiz-next').textContent = quiz.i + 1 < quiz.qs.length ? '다음' : '결과 보기';
    $('#quiz-next').insertAdjacentHTML('beforeend', ' <kbd>Enter</kbd>');
  }

  function quizNext() {
    if (!quiz.answered) return;
    quiz.i++;
    if (quiz.i < quiz.qs.length) { quizRender(); return; }
    quiz.active = false;
    $('#quiz-stage').classList.add('hidden');
    const pct = Math.round(quiz.score / quiz.qs.length * 100);
    $('#quiz-done').classList.remove('hidden');
    $('#quiz-done').innerHTML = `<h2>결과: ${quiz.score} / ${quiz.qs.length} (${pct}%)</h2>
      ${quiz.wrong.length ? `<p>틀린 문제 ${quiz.wrong.length}개</p><div class="result-list">${quiz.wrong.map(q =>
        quiz.kind === 'bignum'
          ? `<span class="badge">${esc(q.prompt)} = ${esc(q.choices[q.answer])}</span>`
          : `<button class="tile st-learning" data-id="${esc(q.item.id)}"><span class="k" lang="ja">${esc(q.item.prompt)}</span><span class="r" lang="ja">${esc(q.item.reading)}</span></button>`).join('')}</div>`
        : '<p>모두 정답입니다! 🎉</p>'}
      <div class="actions"><button class="primary" id="quiz-again">같은 설정으로 다시</button><button id="quiz-settings-btn">설정으로</button></div>`;
    $('#quiz-again').onclick = quiz.kind === 'bignum' ? bignumQuizStart : quizStart;
    $('#quiz-settings-btn').onclick = () => {
      $('#quiz-done').classList.add('hidden');
      setQuizMode(quiz.kind);
    };
    $('#quiz-done').querySelectorAll('.tile').forEach(t => t.onclick = () => openDetail(t.dataset.id));
  }

  $('#quiz-start').addEventListener('click', quizStart);
  $('#bignum-quiz-start').addEventListener('click', bignumQuizStart);
  $('#quiz-choices').addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (b) quizAnswer(Number(b.dataset.i));
  });
  $('#quiz-next').addEventListener('click', quizNext);
  onShow.quiz = params => {
    if (params.has('category')) $('#quiz-cat').value = params.get('category');
    fillSubSelect($('#quiz-cat'), $('#quiz-sub'));
  };

  // ------------------------------------------------------------------ dictation (item + bignum)
  const wr = { items: [], i: 0, active: false, right: 0, wrong: 0, kind: 'item', cur: null, checked: false };

  function setWriteMode(mode) {
    $$('.wmode').forEach(b => b.classList.toggle('active', b.dataset.wmode === mode));
    $('#write-settings').classList.toggle('hidden', mode !== 'item');
    $('#bignum-write-settings').classList.toggle('hidden', mode !== 'bignum');
    $('#write-stage').classList.add('hidden');
    $('#write-done').classList.add('hidden');
  }
  $$('.wmode').forEach(b => b.addEventListener('click', () => setWriteMode(b.dataset.wmode)));

  async function writeStart() {
    const category = $('#write-cat').value, subcategory = $('#write-sub').value,
      source = $('#write-source').value, n = Number($('#write-n').value);
    let items = [];
    try {
      if (source === 'due') {
        const d = await api('/review/next', { category, subcategory, limit: n, new: Math.ceil(n / 2) });
        items = d.items;
      } else {
        const status = source === 'random' ? 'all' : source;
        const d = await api('/items', { category, subcategory, status });
        items = source === 'new' ? d.items.slice(0, n) : shuffle(d.items).slice(0, n);
      }
    } catch (e) { toast(e.message); return; }
    if (!items.length) { toast('조건에 맞는 항목이 없습니다.'); return; }
    Object.assign(wr, { items, i: 0, right: 0, wrong: 0, active: true, kind: 'item' });
    $('#write-settings').classList.add('hidden');
    $('#bignum-write-settings').classList.add('hidden');
    $('#write-done').classList.add('hidden');
    $('#write-stage').classList.remove('hidden');
    writeRenderItem();
  }

  function writeRenderItem() {
    if (wr.i >= wr.items.length) { writeFinish(); return; }
    wr.cur = wr.items[wr.i];
    wr.checked = false;
    const it = wr.cur;
    $('#write-bar').style.width = (wr.i / wr.items.length * 100) + '%';
    $('#write-pos').textContent = `${wr.i + 1} / ${wr.items.length}`;
    $('#write-tag').textContent = subLabel(it.subcategory);
    $('#write-prompt-text').innerHTML = `<span lang="ja">${esc(it.prompt)}</span>`;
    $('#write-prompt-sub').textContent = it.korean;
    resetWriteInput();
  }

  async function bignumWriteStart() {
    const level = $('#bw-level').value, n = Number($('#bw-n').value);
    const ranges = { 2: [10, 99], 3: [100, 999], 4: [1000, 9999], man: [10000, 99999999], oku: [100000000, 999999999999] };
    const [min, max] = ranges[level];
    const items = [];
    for (let i = 0; i < n; i++) items.push(Math.floor(min + Math.random() * (max - min + 1)));
    Object.assign(wr, { items, i: 0, right: 0, wrong: 0, active: true, kind: 'bignum' });
    $('#write-settings').classList.add('hidden');
    $('#bignum-write-settings').classList.add('hidden');
    $('#write-done').classList.add('hidden');
    $('#write-stage').classList.remove('hidden');
    writeRenderBignum();
  }

  function writeRenderBignum() {
    if (wr.i >= wr.items.length) { writeFinish(); return; }
    const n = wr.items[wr.i];
    wr.cur = n;
    wr.checked = false;
    $('#write-bar').style.width = (wr.i / wr.items.length * 100) + '%';
    $('#write-pos').textContent = `${wr.i + 1} / ${wr.items.length}`;
    $('#write-tag').textContent = '큰 수 읽기';
    $('#write-prompt-text').innerHTML = n.toLocaleString('en-US');
    $('#write-prompt-sub').textContent = '이 숫자를 히라가나로 입력하세요';
    resetWriteInput();
  }

  function resetWriteInput() {
    $('#write-input').value = '';
    $('#write-input').disabled = false;
    $('#write-result').classList.add('hidden');
    $('#write-next-row').classList.add('hidden');
    $('#write-input').focus();
  }

  async function writeCheck() {
    if (wr.checked || !wr.active) return;
    const typed = $('#write-input').value.trim();
    if (!typed) { toast('읽기를 입력하세요'); return; }
    wr.checked = true;
    $('#write-input').disabled = true;
    let res;
    try {
      if (wr.kind === 'item') res = await api('/dictation/check', { id: wr.cur.id, reading: typed }, 'POST');
      else res = await api('/bignum/check', { number: wr.cur, reading: typed }, 'POST');
    } catch (e) { toast(e.message); wr.checked = false; $('#write-input').disabled = false; return; }
    if (res.correct) wr.right++; else wr.wrong++;
    const box = $('#write-result');
    box.classList.remove('hidden');
    box.classList.toggle('ok', res.correct);
    box.classList.toggle('bad', !res.correct);
    let html = res.correct ? '정답입니다! ✅' : `틀렸습니다. ❌ <div class="expected" lang="ja">${esc(res.expected)}</div>`;
    if (wr.kind === 'bignum' && res.breakdown) {
      html += `<div class="steps">${res.breakdown.map(s => `<div>${esc(s)}</div>`).join('')}</div>`;
    } else if (wr.kind === 'item' && wr.cur.note) {
      html += `<div class="note-line">${esc(wr.cur.note)}</div>`;
    }
    box.innerHTML = html;
    $('#write-next-row').classList.remove('hidden');
  }

  function writeNext() {
    if (!wr.checked) return;
    wr.i++;
    if (wr.kind === 'item') writeRenderItem(); else writeRenderBignum();
  }

  function writeFinish() {
    wr.active = false;
    $('#write-stage').classList.add('hidden');
    $('#write-done').classList.remove('hidden');
    $('#write-done').innerHTML = `<h2>받아쓰기 완료 ✍️</h2><p>${wr.items.length}개 · 정답 ${wr.right} · 오답 ${wr.wrong}</p>
      <div class="actions"><button class="primary" id="write-again">다시 시작</button><button id="write-settings-btn">설정으로</button></div>`;
    $('#write-again').onclick = wr.kind === 'item' ? writeStart : bignumWriteStart;
    $('#write-settings-btn').onclick = () => { $('#write-done').classList.add('hidden'); setWriteMode(wr.kind); };
  }

  $('#write-start').addEventListener('click', writeStart);
  $('#bw-start').addEventListener('click', bignumWriteStart);
  $('#write-check').addEventListener('click', writeCheck);
  $('#write-next').addEventListener('click', writeNext);
  $('#write-quit').addEventListener('click', () => { wr.items = wr.items.slice(0, wr.i); writeFinish(); });
  $('#write-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { if (!wr.checked) writeCheck(); else writeNext(); }
  });
  onShow.write = params => {
    if (params.has('category')) $('#write-cat').value = params.get('category');
    fillSubSelect($('#write-cat'), $('#write-sub'));
  };

  // ------------------------------------------------------------------ keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape') closeModal(); return; }
    if (currentView === 'flash' && flash.active) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flashFlip(); }
      else if (['1', '2', '3', '4'].includes(e.key) && flash.flipped) flashRate([1, 3, 4, 5][Number(e.key) - 1]);
    } else if (currentView === 'quiz' && quiz.active) {
      if (['1', '2', '3', '4'].includes(e.key) && !quiz.answered) quizAnswer(Number(e.key) - 1);
      else if ((e.key === 'Enter' || e.key === ' ') && quiz.answered) { e.preventDefault(); quizNext(); }
    }
  });

  // ------------------------------------------------------------------ boot
  loadCatalog().then(() => {
    fillCatSelects();
    route();
  }).catch(e => { toast('초기화 실패: ' + e.message); route(); });
})();
