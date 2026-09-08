/* Client-side port of the nihongo-suuji-trainer Java backend (ItemRepository, NumberReader,
   Progress, ProgressStore, Api). Operates entirely in-memory + localStorage, no network. */
const SuujiEngine = (() => {
  'use strict';

  // ---- date helpers (mirror java.time.LocalDate.toEpochDay() semantics) ----
  function toEpochDay(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  function todayEpochDay() { const d = new Date(); return toEpochDay(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function epochDayToISO(day) {
    const dt = new Date(day * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  function isoToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  // ---- Progress (SM-2), mirrors Progress.java ----
  const MASTERED_INTERVAL = 21;
  class Progress {
    constructor(id) {
      this.id = id; this.reps = 0; this.interval = 0; this.ease = 2.5; this.due = 0;
      this.lapses = 0; this.seen = 0; this.correct = 0; this.wrong = 0; this.last = 0;
    }
    isNew() { return this.seen === 0; }
    isDue(today) { return this.seen > 0 && this.due <= today; }
    status(today) {
      if (this.seen === 0) return 'new';
      if (this.interval >= MASTERED_INTERVAL) return 'mastered';
      return 'learning';
    }
    rate(q, today) {
      q = Math.max(0, Math.min(5, q));
      this.seen++; this.last = today;
      if (q < 3) {
        this.wrong++;
        if (this.reps > 0) this.lapses++;
        this.reps = 0; this.interval = 0; this.due = today;
        this.ease = Math.max(1.3, this.ease - 0.2);
        return;
      }
      this.correct++; this.reps++;
      if (this.reps === 1) this.interval = q === 5 ? 4 : 1;
      else if (this.reps === 2) this.interval = 6;
      else this.interval = Math.max(this.interval + 1, Math.round(this.interval * this.ease));
      this.ease = Math.max(1.3, this.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      this.due = today + this.interval;
    }
    markMastered(today) {
      if (this.seen === 0) this.seen = 1;
      this.reps = Math.max(this.reps, 3);
      this.interval = Math.max(this.interval, 30);
      this.due = today + this.interval;
      this.last = today;
    }
    toJson(today) {
      return {
        status: this.status(today), reps: this.reps, interval: this.interval, ease: this.ease,
        due: this.due === 0 ? '' : epochDayToISO(this.due), dueIn: this.due === 0 ? 0 : this.due - today,
        isDue: this.isDue(today), seen: this.seen, correct: this.correct, wrong: this.wrong,
        lapses: this.lapses, last: this.last === 0 ? '' : epochDayToISO(this.last),
      };
    }
  }

  // ---- ProgressStore, localStorage-backed ----
  class ProgressStore {
    constructor(key) { this.key = key; this.map = new Map(); this.load(); }
    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return;
        for (const rec of JSON.parse(raw)) {
          const p = new Progress(rec.id);
          Object.assign(p, rec);
          this.map.set(rec.id, p);
        }
      } catch (e) { console.warn('progress load failed', e); }
    }
    save() {
      const arr = [];
      for (const p of this.map.values()) if (p.seen > 0) arr.push({ ...p });
      try { localStorage.setItem(this.key, JSON.stringify(arr)); } catch (e) { console.warn('progress save failed', e); }
    }
    peek(id) { return this.map.get(id) || new Progress(id); }
    update(id, fn) {
      let p = this.map.get(id);
      if (!p) { p = new Progress(id); this.map.set(id, p); }
      fn(p); this.save(); return p;
    }
    updateAll(ids, fn) {
      for (const id of ids) {
        let p = this.map.get(id);
        if (!p) { p = new Progress(id); this.map.set(id, p); }
        fn(p);
      }
      this.save();
    }
    resetAll(ids) { for (const id of ids) this.map.delete(id); this.save(); }
    reviewedOn(day) { let n = 0; for (const p of this.map.values()) if (p.last === day) n++; return n; }
  }

  const store = new ProgressStore('suuji_progress_v1');

  // ---- NumberReader, mirrors NumberReader.java exactly (independently verified tables) ----
  const NR_MAX = 999999999999; // 9999億9999万9999, just under 兆
  const DIGIT = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
  const JUU = ['', 'じゅう', 'にじゅう', 'さんじゅう', 'よんじゅう', 'ごじゅう', 'ろくじゅう', 'ななじゅう', 'はちじゅう', 'きゅうじゅう'];
  const HYAKU = ['', 'ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく'];
  const SEN = ['', 'せん', 'にせん', 'さんぜん', 'よんせん', 'ごせん', 'ろくせん', 'ななせん', 'はっせん', 'きゅうせん'];
  function readGroup(n) {
    if (n === 0) return '';
    const thousands = Math.floor(n / 1000), hundreds = Math.floor(n / 100) % 10, tens = Math.floor(n / 10) % 10, ones = n % 10;
    return SEN[thousands] + HYAKU[hundreds] + JUU[tens] + DIGIT[ones];
  }
  function nrRead(n) {
    if (n < 0 || n > NR_MAX) throw new Error('out of supported range (0..' + NR_MAX + '): ' + n);
    if (n === 0) return 'れい';
    const oku = Math.floor(n / 100000000), rest = n % 100000000;
    const man = Math.floor(rest / 10000), low = rest % 10000;
    let s = '';
    if (oku > 0) s += readGroup(oku) + 'おく';
    if (man > 0) s += readGroup(man) + 'まん';
    if (low > 0 || s.length === 0) s += readGroup(low);
    return s;
  }
  function nrDisplay(n) { return n.toLocaleString('en-US'); }
  function nrBreakdown(n) {
    const steps = [];
    if (n === 0) { steps.push('0 = れい'); return steps; }
    const oku = Math.floor(n / 100000000), rest = n % 100000000;
    const man = Math.floor(rest / 10000), low = rest % 10000;
    if (oku > 0) steps.push(oku + '億 = ' + readGroup(oku) + 'おく');
    if (man > 0) steps.push(man + '万 = ' + readGroup(man) + 'まん');
    if (low > 0) steps.push(low + ' = ' + readGroup(low));
    return steps;
  }

  // ---- item repository ----
  let ALL = [];
  let byId = new Map();
  let byCategory = new Map();
  let bySubKey = new Map();
  const subKey = (c, s) => c + '/' + s;
  function init(data) {
    ALL = data;
    byId = new Map(); byCategory = new Map(); bySubKey = new Map();
    for (const it of ALL) {
      byId.set(it.id, it);
      if (!byCategory.has(it.category)) byCategory.set(it.category, []);
      byCategory.get(it.category).push(it);
      const k = subKey(it.category, it.subcategory);
      if (!bySubKey.has(k)) bySubKey.set(k, []);
      bySubKey.get(k).push(it);
    }
  }
  function itemsByCategory(category) {
    if (!category || category === 'all') return ALL;
    return byCategory.get(category) || [];
  }
  function itemsBySubcategory(category, subcategory) {
    if (!subcategory || subcategory === 'all') return itemsByCategory(category);
    return bySubKey.get(subKey(category, subcategory)) || [];
  }
  function categoryTree() {
    const out = []; const seen = new Set();
    for (const it of ALL) {
      const k = subKey(it.category, it.subcategory);
      if (!seen.has(k)) { seen.add(k); out.push([it.category, it.subcategory]); }
    }
    return out;
  }
  function categories() {
    const out = []; const seen = new Set();
    for (const it of ALL) if (!seen.has(it.category)) { seen.add(it.category); out.push(it.category); }
    return out;
  }
  function normalizeKana(s) {
    let out = '';
    for (const c of s) {
      const code = c.codePointAt(0);
      out += (code >= 0x30A1 && code <= 0x30F6) ? String.fromCodePoint(code - 0x60) : c;
    }
    return out;
  }
  function searchItems(query, category, subcategory) {
    const q = (query || '').trim();
    const pool = itemsBySubcategory(category, subcategory);
    if (!q) return pool;
    const qn = normalizeKana(q);
    return pool.filter(it => {
      if (it.prompt.includes(q) || it.korean.includes(q)) return true;
      return normalizeKana(it.reading).includes(qn);
    });
  }

  const CATEGORY_LABEL = {
    basic: '기초 한자어 수사', wago: '고유어 수사', place: '자릿수 (십·백·천·만)',
    age: '나이 (歳)', counter: '조수사 (助数詞)', date: '날짜', time: '시간',
  };
  function itemToJson(it, p, today) {
    const obj = { id: it.id, category: it.category, subcategory: it.subcategory, prompt: it.prompt, reading: it.reading, korean: it.korean, note: it.note, irregular: !!it.note };
    if (p) obj.progress = p.toJson(today);
    return obj;
  }

  // ---- helpers mirroring Api.java ----
  function requireItem(id) {
    if (!id) throw new Error('id parameter required');
    const it = byId.get(String(id).trim());
    if (!it) throw new Error('unknown item id: ' + id);
    return it;
  }
  function intParam(p, name, def, min, max) {
    const s = p[name];
    if (s === undefined || s === null || s === '') {
      if (def < min || def > max) throw new Error(name + ' parameter required');
      return def;
    }
    const v = parseInt(s, 10);
    if (isNaN(v) || v < min || v > max) throw new Error(name + ' must be between ' + min + ' and ' + max);
    return v;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  // ---- routes ----
  function catJson(cat, label, c) {
    return { category: cat, label, total: c[0], new: c[1], learning: c[2], mastered: c[3], due: c[4] };
  }
  function countItems(list, today) {
    const c = [0, 0, 0, 0, 0];
    for (const it of list) {
      const pr = store.peek(it.id);
      c[0]++;
      const st = pr.status(today);
      if (st === 'new') c[1]++; else if (st === 'learning') c[2]++; else c[3]++;
      if (pr.isDue(today)) c[4]++;
    }
    return c;
  }
  function categoriesRoute() {
    const today = todayEpochDay();
    const nodes = [];
    for (const [category, sub] of categoryTree()) {
      const items = itemsBySubcategory(category, sub);
      const c = countItems(items, today);
      nodes.push({ category, categoryLabel: CATEGORY_LABEL[category] || category, subcategory: sub, total: c[0], new: c[1], learning: c[2], mastered: c[3], due: c[4] });
    }
    const cats = [];
    for (const cat of categories()) {
      const c = countItems(itemsByCategory(cat), today);
      cats.push({ category: cat, categoryLabel: CATEGORY_LABEL[cat] || cat, total: c[0], new: c[1], learning: c[2], mastered: c[3], due: c[4] });
    }
    return { categories: cats, subcategories: nodes };
  }
  function listItems(p) {
    const today = todayEpochDay();
    const category = p.category || 'all', subcategory = p.subcategory || 'all', status = p.status || 'all';
    const list = searchItems(p.q || '', category, subcategory);
    const items = [];
    for (const it of list) {
      const pr = store.peek(it.id);
      if (status !== 'all') {
        const keep = status === 'due' ? pr.isDue(today) : pr.status(today) === status;
        if (!keep) continue;
      }
      items.push(itemToJson(it, pr, today));
    }
    return { total: items.length, items };
  }
  function itemDetail(id) {
    const it = requireItem(id);
    return itemToJson(it, store.peek(it.id), todayEpochDay());
  }
  function stats() {
    const today = todayEpochDay();
    const cats = []; const total = [0, 0, 0, 0, 0];
    for (const cat of categories()) {
      const c = countItems(itemsByCategory(cat), today);
      for (let i = 0; i < 5; i++) total[i] += c[i];
      cats.push(catJson(cat, CATEGORY_LABEL[cat] || cat, c));
    }
    return { categories: cats, total: catJson('all', '전체', total), reviewedToday: store.reviewedOn(today), today: isoToday() };
  }
  function reviewNext(p) {
    const today = todayEpochDay();
    const category = p.category || 'all', subcategory = p.subcategory || 'all';
    const limit = intParam(p, 'limit', 20, 1, 500);
    const newLimit = intParam(p, 'new', 10, 0, 500);
    const due = [], fresh = [];
    for (const it of itemsBySubcategory(category, subcategory)) {
      const pr = store.peek(it.id);
      if (pr.isDue(today)) due.push(it); else if (pr.isNew()) fresh.push(it);
    }
    due.sort((a, b) => store.peek(a.id).due - store.peek(b.id).due);
    const items = [];
    for (const it of due) { if (items.length >= limit) break; items.push(itemToJson(it, store.peek(it.id), today)); }
    let added = 0;
    for (const it of fresh) { if (items.length >= limit || added >= newLimit) break; items.push(itemToJson(it, store.peek(it.id), today)); added++; }
    return { dueTotal: due.length, newTotal: fresh.length, items };
  }
  function review(p) {
    const it = requireItem(p.id);
    const q = intParam(p, 'q', -1, 0, 5);
    const today = todayEpochDay();
    const pr = store.update(it.id, x => x.rate(q, today));
    return itemToJson(it, pr, today);
  }

  function quiz(p) {
    const category = p.category || 'all', subcategory = p.subcategory || 'all';
    const mode = p.mode || 'reading';
    if (!['reading', 'prompt'].includes(mode)) throw new Error('mode must be reading or prompt');
    const n = intParam(p, 'n', 10, 1, 100);
    const onlyStudied = p.pool === 'studied';
    const pool = itemsBySubcategory(category, subcategory);
    let candidates = pool;
    if (onlyStudied) {
      candidates = pool.filter(it => !store.peek(it.id).isNew());
      if (candidates.length < 4) candidates = pool;
    }
    if (candidates.length < 4) throw new Error('이 범위는 문항을 만들기에 항목이 부족합니다 (4개 이상 필요)');
    const shuffled = shuffle([...candidates]);
    const questions = shuffled.slice(0, Math.min(n, shuffled.length)).map(it => suujiQuestion(it, mode, pool));
    return { mode, questions };
  }
  function suujiQuestion(it, mode, pool) {
    const answer = mode === 'reading' ? it.reading : it.prompt;
    const texts = new Set([answer]);
    const shuffled = shuffle([...pool]);
    for (const d of shuffled) {
      if (texts.size >= 4) break;
      if (d === it) continue;
      const t = mode === 'reading' ? d.reading : d.prompt;
      if (t) texts.add(t);
    }
    const choices = shuffle([...texts]);
    const prompt = mode === 'reading' ? it.prompt : it.reading;
    return { prompt, choices, answer: choices.indexOf(answer), item: itemToJson(it, store.peek(it.id), todayEpochDay()) };
  }
  function quizAnswer(p) {
    const it = requireItem(p.id);
    const correct = p.correct === true || p.correct === 'true';
    const today = todayEpochDay();
    const pr = store.update(it.id, x => {
      if (!correct) x.rate(1, today);
      else if (x.isNew() || x.isDue(today)) x.rate(4, today);
      else { x.correct++; x.last = today; }
    });
    return itemToJson(it, pr, today);
  }

  function normalizeReading(s) { return (s || '').trim().replace(/ /g, '').replace(/　/g, ''); }
  function dictationCheck(p) {
    const it = requireItem(p.id);
    const typed = normalizeReading(p.reading);
    const correct = normalizeReading(it.reading);
    const ok = typed === correct;
    const today = todayEpochDay();
    const pr = store.update(it.id, x => x.rate(ok ? 4 : 1, today));
    return { correct: ok, expected: it.reading, item: itemToJson(it, pr, today) };
  }

  function levelRange(level) {
    switch (level) {
      case '2': return [10, 99];
      case '3': return [100, 999];
      case '4': return [1000, 9999];
      case 'man': return [10000, 99999999];
      case 'oku': return [100000000, NR_MAX];
      default: throw new Error('level must be one of 2, 3, 4, man, oku');
    }
  }
  function randomInRange(min, max) { if (max <= min) return min; return min + Math.floor(Math.random() * (max - min + 1)); }
  function bignumRead(p) {
    const s = p.number;
    if (!s) throw new Error('number parameter required');
    const n = parseInt(String(s).trim().replace(/,/g, ''), 10);
    if (isNaN(n)) throw new Error('bad number: ' + s);
    return { number: n, display: nrDisplay(n), reading: nrRead(n), breakdown: nrBreakdown(n) };
  }
  function bignumQuiz(p) {
    const level = p.level || '3';
    const [min, max] = levelRange(level);
    const n = intParam(p, 'n', 10, 1, 50);
    const questions = [];
    for (let i = 0; i < n; i++) {
      const target = randomInRange(min, max);
      const answer = nrRead(target);
      const texts = new Set([answer]);
      let guard = 0;
      while (texts.size < 4 && guard++ < 100) texts.add(nrRead(randomInRange(min, max)));
      const choices = shuffle([...texts]);
      questions.push({ number: target, display: nrDisplay(target), choices, answer: choices.indexOf(answer) });
    }
    return { level, questions };
  }
  function bignumCheck(p) {
    const s = p.number;
    if (!s && s !== 0) throw new Error('number parameter required');
    const n = parseInt(String(s).trim().replace(/,/g, ''), 10);
    if (isNaN(n)) throw new Error('bad number: ' + s);
    const typed = normalizeReading(p.reading);
    const correct = normalizeReading(nrRead(n));
    const ok = typed === correct;
    return { correct: ok, expected: nrRead(n), number: n, display: nrDisplay(n), breakdown: nrBreakdown(n) };
  }

  function mark(p) {
    const status = p.status || 'mastered';
    const today = todayEpochDay();
    let targets = [];
    if (p.id) targets = [requireItem(p.id).id];
    else { for (const it of itemsBySubcategory(p.category || 'all', p.subcategory || 'all')) targets.push(it.id); }
    if (status === 'mastered') store.updateAll(targets, x => x.markMastered(today));
    else if (status === 'reset') store.resetAll(targets);
    else throw new Error('status must be mastered or reset');
    return { updated: targets.length, stats: stats() };
  }

  function route(method, path, p) {
    const post = method === 'POST';
    if (path === '/categories') return categoriesRoute();
    if (path === '/stats') return stats();
    if (path === '/items') return listItems(p);
    if (path.startsWith('/items/')) return itemDetail(decodeURIComponent(path.slice('/items/'.length)));
    if (path === '/review/next') return reviewNext(p);
    if (path === '/review' && post) return review(p);
    if (path === '/quiz') return quiz(p);
    if (path === '/quiz/answer' && post) return quizAnswer(p);
    if (path === '/dictation/check' && post) return dictationCheck(p);
    if (path === '/bignum/read') return bignumRead(p);
    if (path === '/bignum/quiz') return bignumQuiz(p);
    if (path === '/bignum/check' && post) return bignumCheck(p);
    if (path === '/progress/mark' && post) return mark(p);
    if (path === '/progress/reset' && post) { p.status = 'reset'; return mark(p); }
    throw new Error('not found: ' + path);
  }

  return { init, route, NumberReader: { read: nrRead, display: nrDisplay, breakdown: nrBreakdown, MAX: NR_MAX } };
})();
