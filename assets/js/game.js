/* Velvet Ace — Blackjack engine (vanilla JS, single deck, soft-17 house rules) */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const CHIP_VALUES = [5, 10, 25, 100];

  const state = {
    deck: [],
    player: [],
    dealer: [],
    bank: 500,
    bet: 0,
    round: 0,
    busy: false,
  };

  const els = {
    bank: $("#bank-value"),
    bet: $("#bet-value"),
    chips: $$(".chip"),
    playerCards: $("#player-cards"),
    dealerCards: $("#dealer-cards"),
    playerScore: $("#player-score"),
    dealerScore: $("#dealer-score"),
    msg: $("#msg"),
    btnHit: $("#btn-hit"),
    btnStand: $("#btn-stand"),
    btnDouble: $("#btn-double"),
    btnRebet: $("#btn-rebet"),
    btnDeal: $("#btn-deal"),
  };

  /* ---------- audio (Web Audio, tiny beeps) ---------- */
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
    } catch (_) { /* audio is optional */ }
  }

  /* ---------- deck ---------- */
  function freshDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s, up: true });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function draw() {
    if (state.deck.length === 0) state.deck = freshDeck();
    return state.deck.pop();
  }

  /* ---------- scoring ---------- */
  function value(card) {
    if (card.rank === "A") return 11;
    if (["K", "Q", "J"].includes(card.rank)) return 10;
    return parseInt(card.rank, 10);
  }

  function handValue(hand) {
    let total = 0, aces = 0;
    for (const c of hand) { total += value(c); if (c.rank === "A") aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
  }

  /* ---------- rendering ---------- */
  function cardEl(card) {
    const el = document.createElement("div");
    el.className = "card" + (card.up ? "" : " face-down");
    if (!card.up) { el.setAttribute("aria-hidden", "true"); return el; }
    el.dataset.suit = card.suit;
    const isRed = card.suit === "♥" || card.suit === "♦";
    el.innerHTML = `
      <div class="top"><span>${card.rank}</span>${isRed ? "" : ""}</div>
      <div class="suit-lg">${card.suit}</div>
    `;
    return el;
  }

  function render() {
    els.bank.textContent = state.bank;
    els.bet.textContent = state.bet;
    els.playerCards.innerHTML = "";
    state.player.forEach((c, i) => {
      const el = cardEl(c);
      if (handValue(state.player) > 21) el.classList.add("is-bust");
      els.playerCards.appendChild(el);
    });
    els.dealerCards.innerHTML = "";
    state.dealer.forEach((c, i) => {
      const el = cardEl(c);
      if (handValue(state.dealer) > 21) el.classList.add("is-bust");
      els.dealerCards.appendChild(el);
    });
    els.playerScore.textContent = handValue(state.player) || "—";
    const dealerVisible = state.dealer.filter(c => c.up).reduce((s, c) => s + value(c), 0);
    els.dealerScore.textContent = state.dealer.length ? String(dealerVisible) : "—";
    syncControls();
  }

  function syncControls() {
    const locked = state.busy || state.bet === 0 || state.player.length === 0;
    els.btnHit.disabled = locked;
    els.btnStand.disabled = locked;
    els.btnDouble.disabled = locked || state.player.length !== 2 || state.bank < state.bet;
    els.btnRebet.disabled = state.busy || state.bank < CHIP_VALUES[0];
    els.chips.forEach(c => { c.disabled = state.busy || state.bet >= state.bank || state.player.length > 0; });
  }

  function msg(text, cls = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + cls;
  }

  /* ---------- gameplay ---------- */
  function startRound(rebet = false) {
    if (state.busy) return;
    if (!rebet) {
      state.bet = CHIP_VALUES[0];
      if (state.bank < state.bet) { msg("筹码不足，重置筹码池", "is-loss"); state.bank = 500; }
      state.bank -= state.bet;
    } else {
      if (state.bank < state.bet) { msg("筹码不足，请重新下注", "is-loss"); return; }
      state.bank -= state.bet;
    }
    state.round++;
    state.deck = freshDeck();
    state.player = [draw(), draw()];
    state.dealer = [draw(), { ...draw(), up: false }];
    state.busy = true;
    beep(440, 0.06, "square");
    render();
    msg(`第 ${state.round} 局 — 请行动`);

    if (isBlackjack(state.player)) {
      settle(true, "blackjack");
    } else {
      checkDealerBlackjack();
    }
  }

  function checkDealerBlackjack() {
    // dealer hole card is face down; we already know it in state
    const hole = state.dealer[1];
    const dealerBJ = isBlackjack(state.dealer);
    const playerBJ = isBlackjack(state.player);
    if (dealerBJ) {
      state.dealer[1].up = true;
      render();
      settle(false, "dealer_blackjack");
    }
  }

  function hit() {
    if (state.busy && state.player.length === 0) return;
    if (state.player.length === 0) return;
    if (!state.busy) return;
    state.player.push(draw());
    beep(620, 0.07, "triangle");
    render();
    if (handValue(state.player) > 21) {
      finishDealerTurn(true); // bust — reveal and settle
      return;
    }
    if (handValue(state.player) === 21) {
      stand();
    }
  }

  function stand() {
    if (!state.busy) return;
    state.busy = false;
    finishDealerTurn();
  }

  function double() {
    if (!state.busy || state.player.length !== 2 || state.bank < state.bet) return;
    state.bank -= state.bet;
    state.bet *= 2;
    state.player.push(draw());
    beep(880, 0.07, "triangle");
    render();
    finishDealerTurn();
  }

  function finishDealerTurn(playerAlreadyBusted = false) {
    state.dealer[1].up = true;
    if (!playerAlreadyBusted) {
      while (handValue(state.dealer) < 17) {
        state.dealer.push(draw());
        beep(520, 0.05, "sine");
      }
    }
    render();
    settle();
  }

  function settle(forceWin = false, kind = "") {
    state.busy = false;
    const p = handValue(state.player);
    const d = handValue(state.dealer);
    let outcome = "push";
    if (forceWin || (p <= 21 && (d > 21 || p > d))) outcome = "win";
    else if (p === d) outcome = "push";
    else outcome = "loss";

    let payout = 0;
    if (outcome === "win") payout = kind === "blackjack" ? Math.floor(state.bet * 2.5) : state.bet * 2;
    else if (outcome === "push") payout = state.bet;

    state.bank += payout;

    if (outcome === "win") {
      msg(kind === "blackjack" ? "Blackjack！ 奖金 2.5 倍" : "你赢了", "is-win");
      beep(780, 0.12, "sine", 0.07); setTimeout(() => beep(1040, 0.14, "sine", 0.06), 110);
    } else if (outcome === "push") {
      msg("平局，退回筹码");
    } else {
      msg("庄家胜", "is-loss");
      beep(200, 0.16, "sawtooth", 0.04);
    }
    render();
  }

  /* ---------- init ---------- */
  els.chips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (state.player.length > 0 || state.busy) return;
      const v = parseInt(chip.dataset.value, 10);
      if (state.bank < v) { msg("筹码不足", "is-loss"); return; }
      state.bet = v;
      els.chips.forEach(c => c.classList.toggle("selected", c === chip));
      beep(660, 0.06, "sine");
      render();
    });
  });

  els.btnHit.addEventListener("click", hit);
  els.btnStand.addEventListener("click", stand);
  els.btnDouble.addEventListener("click", double);
  els.btnDeal.addEventListener("click", () => {
    if (state.busy) return;
    if (state.bet === 0) {
      state.bet = CHIP_VALUES[0];
      if (state.bank < state.bet) { msg("筹码不足，重置筹码池", "is-loss"); state.bank = 500; }
      state.bank -= state.bet;
    }
    startRound(true);
  });
  els.btnRebet.addEventListener("click", () => {
    if (state.bank < state.bet) { msg("筹码不足，请重新下注", "is-loss"); return; }
    state.bank -= state.bet;
    state.bet = Math.min(state.bet, state.bank + state.bet);
    startRound(true);
  });

  // default bet = first chip
  els.chips.forEach(c => {
    if (parseInt(c.dataset.value, 10) === CHIP_VALUES[0]) c.classList.add("selected");
  });

  msg("点击筹码下注，再按 发牌 开始");
  els.bank.textContent = state.bank;
  els.bet.textContent = 0;
  els.playerScore.textContent = "—";
  els.dealerScore.textContent = "—";

  // expose for console debugging
  window.velvetAce = { state, hit, stand, double, startRound };
})();
