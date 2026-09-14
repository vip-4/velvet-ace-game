/* Velvet Ace — European Roulette engine (37 pockets, multi-bet, vanilla JS) */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- wheel order (European) ---- */
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const BLACK = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);
  const isRed = (n) => RED.has(n);
  const isBlack = (n) => BLACK.has(n);

  const CHIP_VALUES = [5, 10, 25, 100];
  const PAY = { straight: 35, red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1, dozen: 2, col: 2 };

  const state = {
    bank: 500,
    chip: 10,
    bets: {},            // betKey -> amount ; straight:17 -> {type:'straight',num}
    spinning: false,
    spins: 0,
  };

  const els = {
    wheel: $("#roulette-wheel"),
    ball: $("#roulette-ball"),
    msg: $("#roulette-msg"),
    bank: $("#roulette-bank"),
    bet: $("#roulette-bet"),
    chips: $$(".chip"),
    btnSpin: $("#btn-roulette-spin"),
    btnRebet: $("#btn-roulette-rebet"),
    btnClear: $("#btn-roulette-clear"),
    board: $("#roulette-board"),
    result: $("#roulette-result"),
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
  function msg(text, cls = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + cls;
  }

  function totalBet() {
    return Object.values(state.bets).reduce((s, v) => s + v, 0);
  }

  function parseBetKey(key) {
    if (key.startsWith("straight:")) return { type: "straight", num: parseInt(key.split(":")[1], 10) };
    if (key.startsWith("dozen:")) return { type: "dozen", range: key.split(":")[1] };
    if (key.startsWith("col:")) return { type: "col", col: key.split(":")[1] };
    return { type: key };
  }

  /* ---------- wheel build ---------- */
  function buildWheel() {
    els.wheel.innerHTML = "";
    WHEEL.forEach((n, i) => {
      const seg = document.createElement("div");
      seg.className = "roulette-seg " + (n === 0 ? "is-zero" : isRed(n) ? "is-red" : "is-black");
      seg.textContent = n;
      seg.style.transform = `rotate(${(360 / WHEEL.length) * i}deg) translateY(-50%)`;
      seg.dataset.num = n;
      els.wheel.appendChild(seg);
    });
  }

  /* ---------- board build (numbers 1-36 + 0 + outside) ---------- */
  function buildBoard() {
    const html = [];
    // zero column + number grid 3x12
    html.push('<div class="roulette-zero"><button type="button" data-bet="straight:0">0</button></div>');
    html.push('<div class="roulette-grid">');
    for (let row = 1; row <= 12; row++) {
      for (let col = 3; col >= 1; col--) {
        const n = col + (row - 1) * 3;
        html.push(`<button type="button" class="num ${isRed(n) ? "is-red" : "is-black"}" data-bet="straight:${n}">${n}</button>`);
      }
    }
    html.push("</div>");
    // column bets (right side)
    html.push('<div class="roulette-cols">');
    for (let c = 1; c <= 3; c++) html.push(`<button type="button" data-bet="col:${c}">2:1</button>`);
    html.push("</div>");
    // outside row: low/even/red/black/odd/high
    html.push('<div class="roulette-outside">');
    html.push('<button type="button" data-bet="low">1-18</button>');
    html.push('<button type="button" data-bet="even">Even</button>');
    html.push('<button type="button" class="is-red" data-bet="red">Red</button>');
    html.push('<button type="button" class="is-black" data-bet="black">Black</button>');
    html.push('<button type="button" data-bet="odd">Odd</button>');
    html.push('<button type="button" data-bet="high">19-36</button>');
    html.push("</div>");
    // dozens
    html.push('<div class="roulette-dozens">');
    for (let d = 1; d <= 3; d++) html.push(`<button type="button" data-bet="dozen:${d}">${d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} 12</button>`);
    html.push("</div>");

    els.board.innerHTML = html.join("");

    els.board.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-bet]");
      if (!btn || state.spinning) return;
      const key = btn.dataset.bet;
      if (state.bank < state.chip) { msg("筹码不足", "is-loss"); return; }
      state.bets[key] = (state.bets[key] || 0) + state.chip;
      state.bank -= state.chip;
      paintBets();
      beep(660, 0.05, "sine");
      msg(`已下注 ${state.chip} 筹码 → ${betLabel(key)}`);
      render();
    });
  }

  function betLabel(key) {
    const p = parseBetKey(key);
    if (p.type === "straight") return "直注 " + p.num;
    if (p.type === "dozen") return p.range + " 打组";
    if (p.type === "col") return p.col + " 列";
    return { red: "红", black: "黑", even: "偶", odd: "奇", low: "1-18", high: "19-36" }[p.type] || p.type;
  }

  function paintBets() {
    els.board.querySelectorAll("button[data-bet]").forEach(btn => {
      const key = btn.dataset.bet;
      const amt = state.bets[key] || 0;
      btn.classList.toggle("has-bet", amt > 0);
      if (amt > 0) btn.setAttribute("data-amount", amt);
      else btn.removeAttribute("data-amount");
    });
  }

  /* ---------- spin & settle ---------- */
  function spin() {
    if (state.spinning) return;
    if (totalBet() === 0) { msg("先放几个筹码再转吧", "is-loss"); return; }
    if (state.bank < 0) { state.bank = 0; }

    state.spinning = true;
    syncControls();
    beep(440, 0.06, "square");

    const target = Math.floor(Math.random() * 37);
    spinAnimation(target);

    setTimeout(() => settle(target), 4300);
  }

  function spinAnimation(target) {
    // wheel rotation: multiple laps + land target at top
    const idx = WHEEL.indexOf(target);
    const segDeg = 360 / WHEEL.length;
    const targetTop = (360 - (idx * segDeg) + 90) % 360; // seg i center at top = -idx*segDeg + offset
    const laps = 4 + Math.floor(Math.random() * 2);
    const total = laps * 360 + targetTop + Math.random() * segDeg * 0.6 - segDeg * 0.3;
    els.wheel.style.transition = "transform 4.2s cubic-bezier(0.15,0.7,0.2,1)";
    els.wheel.style.transform = `rotate(${total}deg)`;
    els.ball.style.transition = "transform 4.2s cubic-bezier(0.4,0.8,0.6,0.9)";
    els.ball.style.transform = `rotate(${-total * 2}deg)`;
    msg("轮盘旋转中…");
  }

  function settle(n) {
    const wins = [];
    let total = 0;
    Object.entries(state.bets).forEach(([key, amt]) => {
      const p = parseBetKey(key);
      let hit = false;
      if (p.type === "straight") hit = (p.num === n);
      else if (p.type === "red") hit = isRed(n);
      else if (p.type === "black") hit = isBlack(n);
      else if (p.type === "even") hit = n !== 0 && n % 2 === 0;
      else if (p.type === "odd") hit = n % 2 === 1;
      else if (p.type === "low") hit = n >= 1 && n <= 18;
      else if (p.type === "high") hit = n >= 19 && n <= 36;
      else if (p.type === "dozen") { const lo = (parseInt(p.range, 10) - 1) * 12 + 1; hit = n >= lo && n <= lo + 11; }
      else if (p.type === "col") { const c = parseInt(p.col, 10); hit = n !== 0 && (n - 1) % 3 === c - 1; }
      if (hit) {
        const payout = amt * (PAY[p.type] + 1);
        wins.push({ label: betLabel(key), amt, payout });
        total += payout;
      }
    });

    state.bank += total;
    state.spinning = false;
    state.spins++;

    // highlight winning pocket
    const segs = $$(".roulette-seg", els.wheel);
    segs.forEach(s => s.classList.toggle("is-hit", parseInt(s.dataset.num, 10) === n));
    beep(700, 0.1, "sine", 0.07);
    setTimeout(() => beep(1040, 0.14, "sine", 0.06), 300);

    if (wins.length === 0) {
      msg(`开出了 ${n}（${colorName(n)}），未中奖`, "is-loss");
    } else {
      const sum = wins.reduce((s, w) => s + w.payout, 0);
      msg(`开出 ${n}！命中 ${wins.length} 注，赢得 ${sum} 筹码`, "is-win");
      setTimeout(() => beep(880, 0.12, "triangle", 0.06), 500);
    }
    render();
    syncControls();
    persistCloud(wins.length > 0, total);
  }

  function colorName(n) {
    if (n === 0) return "绿零";
    return isRed(n) ? "红" : "黑";
  }

  /* ---------- ui ---------- */
  function syncControls() {
    els.btnSpin.disabled = state.spinning;
    els.btnRebet.disabled = state.spinning;
    els.btnClear.disabled = state.spinning;
    els.chips.forEach(c => { c.disabled = state.spinning; });
    els.board.style.pointerEvents = state.spinning ? "none" : "auto";
  }

  function render() {
    els.bank.textContent = state.bank;
    els.bet.textContent = totalBet();
    syncControls();
  }

  /* ---------- cloud sync ---------- */
  function persistCloud(won = false, lastWin = 0) {
    const bk = window.velvetBackend;
    if (!bk) return;
    bk.savePlayer({ chips: state.bank, spins: state.spins, rounds: 0 }).catch(() => {});
    if (won && lastWin > 0) bk.submitScore("roulette", state.bank).catch(() => {});
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
    } catch (_) { /* offline */ }
  }

  /* ---------- init ---------- */
  els.chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const v = parseInt(chip.dataset.value, 10);
      if (state.spinning) return;
      state.chip = v;
      els.chips.forEach(c => c.classList.toggle("selected", c === chip));
      beep(660, 0.05, "sine");
      render();
    });
  });

  els.btnSpin.addEventListener("click", spin);
  els.btnClear.addEventListener("click", () => {
    if (state.spinning) return;
    Object.values(state.bets).forEach(v => { state.bank += v; });
    state.bets = {};
    paintBets();
    msg("已收回所有下注");
    render();
  });
  els.btnRebet.addEventListener("click", () => {
    if (state.spinning) return;
    const keys = Object.keys(state.bets);
    if (!keys.length) { msg("还没有可复投的注", "is-loss"); return; }
    let need = 0;
    keys.forEach(k => { need += state.bets[k]; });
    if (state.bank < need) { msg("筹码不足，无法复投", "is-loss"); return; }
    state.bank -= need;
    // keep same bets (already in state.bets), just deduct bank
    paintBets();
    beep(520, 0.06, "sine");
    render();
    msg(`已复投 ${need} 筹码`);
  });

  buildWheel();
  buildBoard();
  els.chips.forEach(c => {
    if (parseInt(c.dataset.value, 10) === CHIP_VALUES[1]) c.classList.add("selected");
  });

  msg("选筹码面额，点击盘面数字或区域下注，再按 转起来");
  render();
  syncFromCloud();
  if (window.velvetBackend) window.velvetBackend.renderLeaderboard("roulette", "lb-roulette");

  window.velvetRoulette = { state, spin, settle };
})();
