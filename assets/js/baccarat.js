/* Velvet Ace — Baccarat (Punto Banco, 8-deck simplified, vanilla JS) */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const CHIP_VALUES = [5, 10, 25, 100];
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_VAL = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 0, J: 0, Q: 0, K: 0 };
  const RED_SUITS = new Set(["♥", "♦"]);
  const PAY = { player: 1, banker: 0.95, tie: 8 };   // banker 5% commission shown, payout simplified to 1:1

  const state = {
    bank: 500,
    chip: 10,
    bets: { player: 0, banker: 0, tie: 0 },
    shoe: [],
    dealt: 0,
    result: null,
    playing: false,
    rounds: 0,
  };

  const els = {
    msg: $("#baccarat-msg"),
    bank: $("#baccarat-bank"),
    bet: $("#baccarat-bet"),
    chips: $$(".chip"),
    btnDeal: $("#btn-baccarat-deal"),
    btnClear: $("#btn-baccarat-clear"),
    btnRebet: $("#btn-baccarat-rebet"),
    playerHand: $("#baccarat-player-hand"),
    bankerHand: $("#baccarat-banker-hand"),
    playerTotal: $("#baccarat-player-total"),
    bankerTotal: $("#baccarat-banker-total"),
    result: $("#baccarat-result"),
  };

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
    } catch (_) {}
  }

  function msg(text, cls = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + cls;
  }

  function totalBet() {
    return state.bets.player + state.bets.banker + state.bets.tie;
  }

  /* ---------- shoe ---------- */
  function buildShoe(decks = 8) {
    const shoe = [];
    for (let d = 0; d < decks; d++) {
      for (const s of SUITS) {
        for (const r of RANKS) shoe.push({ rank: r, suit: s, val: RANK_VAL[r] });
      }
    }
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
  }

  function drawCard() {
    if (state.shoe.length < 16) state.shoe = buildShoe(); // reshuffle near end
    const c = state.shoe.pop();
    state.dealt++;
    return c;
  }

  function cardHTML(c) {
    const red = RED_SUITS.has(c.suit);
    const face = c.rank === "10" ? "10" : c.rank;
    return `<span class="card ${red ? "is-red" : ""}"><i>${face}</i><b>${c.suit}</b></span>`;
  }

  function handTotal(cards) {
    return cards.reduce((s, c) => s + c.val, 0) % 10;
  }

  function handLabel(cards) {
    return cards.map(c => c.rank + c.suit).join(" ");
  }

  /* ---------- bet ---------- */
  function placeBet(key) {
    if (state.playing) return;
    if (state.bank < state.chip) { msg("筹码不足", "is-loss"); return; }
    state.bets[key] += state.chip;
    state.bank -= state.chip;
    beep(660, 0.05, "sine");
    paintBets();
    render();
    msg(`已下注 ${state.chip} → ${key === "player" ? "闲" : key === "banker" ? "庄" : "和"}`);
  }

  function paintBets() {
    $$("[data-betzone]").forEach(zone => {
      const key = zone.dataset.betzone;
      const amt = state.bets[key] || 0;
      zone.classList.toggle("has-bet", amt > 0);
      const badge = $(".bet-badge", zone);
      if (badge) badge.textContent = amt ? String(amt) : "";
    });
  }

  /* ---------- deal & settle ---------- */
  function deal() {
    if (state.playing) return;
    if (totalBet() === 0) { msg("先押一门再发牌", "is-loss"); return; }
    if (state.bank < 0) state.bank = 0;

    state.playing = true;
    syncControls();
    beep(440, 0.06, "square");

    const player = [drawCard(), drawCard()];
    const banker = [drawCard(), drawCard()];
    const pTotal = handTotal(player);
    const bTotal = handTotal(banker);

    // draw order animation: banker, player, banker, player
    const renderAll = () => {
      els.playerHand.innerHTML = player.map(cardHTML).join("");
      els.bankerHand.innerHTML = banker.map(cardHTML).join("");
      els.playerTotal.textContent = handTotal(player);
      els.bankerTotal.textContent = handTotal(banker);
    };

    setTimeout(() => { els.bankerHand.innerHTML = cardHTML(banker[0]); beep(520, 0.07); }, 350);
    setTimeout(() => { els.playerHand.innerHTML = cardHTML(player[0]); beep(560, 0.07); }, 700);
    setTimeout(() => { els.bankerHand.innerHTML = banker.slice(0, 2).map(cardHTML).join(""); beep(520, 0.07); }, 1050);
    setTimeout(() => {
      els.playerHand.innerHTML = player.map(cardHTML).join("");
      els.bankerHand.innerHTML = banker.map(cardHTML).join("");
      els.playerTotal.textContent = pTotal;
      els.bankerTotal.textContent = bTotal;
      beep(600, 0.08);
      msg(`闲 ${handLabel(player)} (${pTotal}) ｜ 庄 ${handLabel(banker)} (${bTotal})`);
    }, 1400);

    // third card rules (simplified Punto Banco)
    let p3 = null, b3 = null;
    const pNatural = pTotal >= 8, bNatural = bTotal >= 8;
    if (!pNatural && !bNatural) {
      if (pTotal <= 5) {
        p3 = drawCard();
        player.push(p3);
        const pAfter = handTotal(player);
        // banker draws per simplified table vs player 3rd card value
        if (bTotal <= 2) b3 = drawCard();
        else if (bTotal === 3 && p3.val !== 8) b3 = drawCard();
        else if (bTotal === 4 && [2, 3, 4, 5, 6, 7].includes(p3.val)) b3 = drawCard();
        else if (bTotal === 5 && [4, 5, 6, 7].includes(p3.val)) b3 = drawCard();
        else if (bTotal === 6 && [6, 7].includes(p3.val)) b3 = drawCard();
      } else {
        if (bTotal <= 5) b3 = drawCard();
      }
      if (b3) banker.push(b3);
    }

    const finalP = handTotal(player);
    const finalB = handTotal(banker);

    if (p3 || b3) {
      setTimeout(() => {
        renderAll();
        beep(620, 0.08);
        msg(`补牌完成 ｜ 闲 ${finalP} 庄 ${finalB}`);
      }, 2100);
    }

    setTimeout(() => settle(finalP, finalB, { p3, b3 }), (p3 || b3) ? 2700 : 2000);
  }

  function settle(fp, fb, extra) {
    let winner = "";
    if (fp > fb) winner = "player";
    else if (fb > fp) winner = "banker";
    else winner = "tie";

    let won = 0;
    if (winner === "tie") won += state.bets.tie * (PAY.tie + 1);
    else if (winner === "player") won += state.bets.player * (PAY.player + 1);
    else won += state.bets.banker * (PAY.banker + 1); // banker 1:1 + 5% commission simplified to 0.95 payout

    state.bank += Math.round(won);
    state.rounds++;

    const winLabel = { player: "闲赢", banker: "庄赢", tie: "和局" }[winner];
    els.result.textContent = `闲 ${fp} : ${fb} 庄 ｜ ${winLabel}`;
    els.result.classList.add("is-show");

    if (won > 0) {
      msg(`${winLabel}！赢得 ${Math.round(won)} 筹码`, "is-win");
      setTimeout(() => beep(880, 0.12, "triangle", 0.06), 400);
    } else {
      msg(`${winLabel}，未中奖`, "is-loss");
    }

    state.playing = false;
    render();
    syncControls();
    persistCloud(won > 0, Math.round(won));
  }

  /* ---------- ui ---------- */
  function syncControls() {
    els.btnDeal.disabled = state.playing;
    els.btnClear.disabled = state.playing;
    els.btnRebet.disabled = state.playing;
    els.chips.forEach(c => { c.disabled = state.playing; });
  }

  function render() {
    els.bank.textContent = state.bank;
    els.bet.textContent = totalBet();
    paintBets();
    syncControls();
  }

  /* ---------- cloud ---------- */
  function persistCloud(won = false, lastWin = 0) {
    const bk = window.velvetBackend;
    if (!bk) return;
    bk.savePlayer({ chips: state.bank, spins: 0, rounds: state.rounds }).catch(() => {});
    if (won && lastWin > 0) bk.submitScore("baccarat", state.bank).catch(() => {});
  }

  async function syncFromCloud() {
    const bk = window.velvetBackend;
    if (!bk) return;
    try {
      const p = await bk.fetchPlayer();
      if (p && typeof p.chips === "number" && p.chips > 0) {
        state.bank = p.chips;
        state.rounds = p.rounds || 0;
      }
      render();
    } catch (_) {}
  }

  /* ---------- init ---------- */
  els.chips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (state.playing) return;
      state.chip = parseInt(chip.dataset.value, 10);
      els.chips.forEach(c => c.classList.toggle("selected", c === chip));
      beep(660, 0.05, "sine");
      render();
    });
  });

  $$("[data-betzone]").forEach(zone => {
    zone.addEventListener("click", () => placeBet(zone.dataset.betzone));
  });

  els.btnDeal.addEventListener("click", deal);
  els.btnClear.addEventListener("click", () => {
    if (state.playing) return;
    state.bank += totalBet();
    state.bets = { player: 0, banker: 0, tie: 0 };
    els.result.classList.remove("is-show");
    paintBets();
    msg("已收回所有下注");
    render();
  });
  els.btnRebet.addEventListener("click", () => {
    if (state.playing) return;
    const need = totalBet();
    if (!need) { msg("还没有可复投的注", "is-loss"); return; }
    if (state.bank < need) { msg("筹码不足，无法复投", "is-loss"); return; }
    state.bank -= need;
    beep(520, 0.06, "sine");
    render();
    msg(`已复投 ${need} 筹码`);
  });

  state.shoe = buildShoe();
  msg("选择庄 / 闲 / 和，押注后发牌");
  render();
  syncFromCloud();
  if (window.velvetBackend) window.velvetBackend.renderLeaderboard("baccarat", "lb-baccarat");

  window.velvetBaccarat = { state, deal };
})();
