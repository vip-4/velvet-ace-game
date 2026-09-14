/* Velvet Ace — Supabase backend client (anonymous REST, RLS open for demo) */
(() => {
  "use strict";

  const URL = "https://cvcytqucawvrerklsjrd.supabase.co";
  const KEY = "sb_publishable_mwHwIZmkQg0_q1t8TZr6cw_Wb5WGGJ-";

  function uid() {
    try {
      return crypto.randomUUID();
    } catch (_) {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  }

  function getPlayerKey() {
    let k = localStorage.getItem("velvet_player_key");
    if (!k) {
      k = uid();
      localStorage.setItem("velvet_player_key", k);
    }
    return k;
  }

  function playerName() {
    let n = localStorage.getItem("velvet_player_name");
    if (!n) {
      n = "玩家" + getPlayerKey().slice(0, 4);
      localStorage.setItem("velvet_player_name", n);
    }
    return n;
  }

  async function api(path, opts = {}) {
    const res = await fetch(URL + path, {
      ...opts,
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(path + " -> " + res.status);
    return res.status === 204 ? null : res.json();
  }

  async function fetchPlayer() {
    const k = getPlayerKey();
    const q = "/rest/v1/velvet_players?select=chips,spins,rounds&player_key=eq." + encodeURIComponent(k) + "&limit=1";
    const rows = await api(q);
    return rows && rows.length ? rows[0] : null;
  }

  async function savePlayer({ chips, spins, rounds }) {
    const k = getPlayerKey();
    return api("/rest/v1/velvet_players?on_conflict=player_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ player_key: k, display_name: playerName(), chips, spins, rounds }),
    });
  }

  async function submitScore(game, score) {
    return api("/rest/v1/velvet_scores", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ player_name: playerName(), game, score }),
    });
  }

  async function loadLeaderboard(game, limit = 10) {
    return api("/rest/v1/velvet_scores?game=eq." + game + "&order=score.desc&limit=" + limit + "&select=player_name,score,created_at");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function renderLeaderboard(game, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<li class="lb-loading">加载中…</li>';
    try {
      const rows = await loadLeaderboard(game, 10);
      if (!rows.length) {
        el.innerHTML = '<li class="lb-empty">暂无纪录，来抢第一</li>';
        return;
      }
      el.innerHTML = rows
        .map(
          (r, i) =>
            `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(r.player_name)}</span><span class="lb-score">${r.score} 筹码</span></li>`
        )
        .join("");
    } catch (_) {
      el.innerHTML = '<li class="lb-empty">排行榜暂时不可用</li>';
    }
  }

  window.velvetBackend = { URL, KEY, getPlayerKey, playerName, fetchPlayer, savePlayer, submitScore, loadLeaderboard, renderLeaderboard };
})();
