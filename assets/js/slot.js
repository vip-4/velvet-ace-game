/* Velvet Ace — Slot engine (3x3, 5 paylines, weighted symbols, vanilla JS) */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- symbol pool (weighted) ---- */
  const SYMBOLS = [
    { id: "diamond", label: "◆", cls: "sym-diamond", weight: 24, pay: 2 },
    { id: "lemon", label: "🍋", cls: "sym-lemon", weight: 22, pay: 4 },
    { id: "grape", label: "🍇", cls: "sym-grape", weight: 18, pay: 6 },
    { id: "cherry", label: "🍒", cls: "sym-cherry", weight: 15, pay: 8 },
    { id: "bell", label: "♬", cls: "sym-bell", weight: 11, pay: 10 },
    { id: "bar", label: "BAR", cls: "sym-bar", weight: 7, pay: 20 },
    { id: "seven", label: "7", cls: "sym-7", weight: 3, pay: 50 },
  ];
  const POOL = [];
  SYMBOLS.forEach(s => { for (let i = 0; i < s.weight; i++) POOL.push(s); });

  /* ---- paylines: rows 0-2 + diagonals ---- */
  const LINES = [
    [0, 1, 2],       // top row
    [3, 4, 5],       // middle row
    [6, 7, 8],       // bottom row
    [0, 4, 8],       // diagonal \
    [2, 4, 6],       // diagonal /
  ];

  const CHIP_VALUES = [5, 10, 25, 100];

  const state = {
    bank: 500,
    bet: 0,
    spinning: false,
    grid: [],
    spins: 0,
  };

  const els = {
    reels: $$(".reel"),
    msg: $("#slot-msg"),
    bank: $("#slot-bank"),
    bet: $("#slot-bet"),
    btnSpin: $("#btn-spin"),
    btnRebet: $("#btn-slot-rebet"),
    chips: $$(".chip"),
  };

  /* ---------- audio ---------- */
  let audioCtx = null;
  function beep(freq = 520, dur = 0.08, type = "sine", gain = 0.06) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(g).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur + 0.02);
    } catch (_) { /* audio optional */ }
  }

  /* ---------- helpers ---------- */
  function randSymbol() {
    return POOL[Math.floor(Math.random() * POOL.length)];
  }

  function symbolEl(sym) {
    const el = document.createElement("span");
    el.className = "cell " + sym.cls;
    el.textContent = sym.label;
    return el;
  }

  function makeReel() {
    // 5 visible slots per reel for smooth scrolling (3 shown + overshoot)
    return [randSymbol(), randSymbol(), randSymbol(), randSymbol(), randSymbol()];
  }

  function renderReel(reelEl, reelArr) {
    reelEl.innerHTML = "";
    reelArr.forEach(s => reelEl.appendChild(symbolEl(s)));
  }

  /* ---------- win detection ---------- */
  function evaluate(grid) {
    const wins = [];
    LINES.forEach((line, li) => {
      const [a, b, c] = line.map(i => grid[i]);
      if (a.id === b.id && b.id === c.id) {
        wins.push({ line: li, symbol: a, cells: line, payout: a.pay * state.bet });
      }
    });
    return wins;
  }

  /* ---------- spin ---------- */
  function spin(rebet = false) {
    if (state.spinning) return;
    if (!rebet) {
      if (state.bet === 0) state.bet = CHIP_VALUES[0];
      if (state.bank < state.bet) { msg("筹码不足，重置筹码池", "is-loss"); state.bank = 500; }
      state.bank -= state.bet;
    } else {
      if (state.bank < state.bet) { msg("筹码不足，请重新下注", "is-loss"); return; }
      state.bank -= state.bet;
    }

    state.spinning = true;
    syncControls();
    beep(440, 0.06, "square");

    // animate: each reel spins with staggered stop
    const finals = [[], [], []];
    for (let c = 0; c < 3; c++) {
      finals[c] = makeReel();
      renderReel(els.reels[c], finals[c]);
    }

    els.reels.forEach((r, i) => r.classList.add("spinning"));
    msg("转轴旋转中…");

    const delays = [450, 900, 1350];
    els.reels.forEach((reel, i) => {
      setTimeout(() => {
        // settle column i: re-render with stable final strip (symbols at indices 1..3 = middle band)
        const strip = finals[i];
        reel.classList.remove("spinning");
        renderReel(reel, strip);
        beep(520 + i * 120, 0.07, "triangle");
        if (i === 2) finishSpin(strip);
      }, delays[i]);
    });
  }

  function finishSpin(strips) {
    // build 3x3 grid from the middle band of each strip (indices 1,2,3)
    const grid = [];
    for (let c = 0; c < 3; c++) {
      grid.push(strips[c][1], strips[c][2], strips[c][3]);
    }
    state.grid = grid;
    const wins = evaluate(grid);

    if (wins.length === 0) {
      state.spinning = false;
      state.spins++;
      msg("未中奖，再试一次", "is-loss");
      beep(200, 0.16, "sawtooth", 0.04);
      syncControls();
      persistCloud(false);
      return;
    }

    // highlight winning cells
    const cells = $$(".cell");
    wins.forEach((w, wi) => {
      setTimeout(() => {
        w.cells.forEach(idx => {
          const pos = idxToPos(idx);
          const reelEl = els.reels[pos.col];
          const rowEl = reelEl.children[pos.row + 1]; // offset by top buffer
          if (rowEl) rowEl.classList.add("is-win");
        });
        beep(700 + wi * 160, 0.1, "sine", 0.07);
      }, 260 + wi * 380);
    });

    const total = wins.reduce((s, w) => s + w.payout, 0);
    state.bank += total;
    state.spinning = false;
    state.spins++;
    msg(`中奖！奖金 ${total} 筹码（${wins.length} 条赢线）`, "is-win");
    setTimeout(() => beep(1040, 0.14, "sine", 0.06), 500);
    syncControls();
    persistCloud(true, total);
  }

  function idxToPos(idx) {
    return { col: Math.floor(idx / 3), row: idx % 3 };
  }

  /* ---------- ui ---------- */
  function msg(text, cls = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + cls;
  }

  function syncControls() {
    els.btnSpin.disabled = state.spinning;
    els.btnRebet.disabled = state.spinning || state.bank < state.bet;
    els.chips.forEach(c => { c.disabled = state.spinning; });
  }

  function render() {
    els.bank.textContent = state.bank;
    els.bet.textContent = state.bet;
    syncControls();
  }

  /* ---------- cloud sync (Supabase) ---------- */
  function persistCloud(won = false) {
    const bk = window.velvetBackend;
    if (!bk) return;
    bk.savePlayer({ chips: state.bank, spins: state.spins, rounds: 0 }).catch(() => {});
    if (won) bk.submitScore("slot", state.bank).catch(() => {});
  }

  async function syncFromCloud() {
    const bk = window.velvetBackend;
    if (!bk) return;
    try {
      const p = await bk.fetchPlayer();
      if (p && typeof p.chips === "number" && p.chips > 0) {
        state.bank = p.chips;
        state.spins = p.spins || 0;
      }
      render();
    } catch (_) { /* offline: keep local defaults */ }
  }

  /* ---------- init ---------- */
  els.chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const v = parseInt(chip.dataset.value, 10);
      if (state.bank < v) { msg("筹码不足", "is-loss"); return; }
      state.bet = v;
      els.chips.forEach(c => c.classList.toggle("selected", c === chip));
      beep(660, 0.06, "sine");
      render();
    });
  });

  els.btnSpin.addEventListener("click", () => spin(false));
  els.btnRebet.addEventListener("click", () => spin(true));

  // initial reel display
  for (let c = 0; c < 3; c++) {
    renderReel(els.reels[c], makeReel());
  }
  els.chips.forEach(c => {
    if (parseInt(c.dataset.value, 10) === CHIP_VALUES[0]) c.classList.add("selected");
  });

  msg("点击筹码下注，再按 开转 开始");
  render();
  syncFromCloud();
  if (window.velvetBackend) window.velvetBackend.renderLeaderboard("slot", "lb-slot");

  window.velvetSlot = { state, spin, evaluate };
})();
