// ============================================================
//  AXES BANK — Shared Economy Engine v2.0 
//  Include on every page AFTER firebase compat scripts
// ============================================================

const ECONOMY = {
  BASE_RATE: 95,
  TARGET_SUPPLY: 1_000_000,
  FLOOR: 40,
  CEILING: 150,
  DRIFT_MAX: 0.25,
  HISTORY_POINTS: 30,
};

// Rate goes DOWN when total coins are high (inflation)
// Rate goes UP when total coins are scarce
function calcRate(totalCoins, nudge) {
  totalCoins = Math.max(totalCoins || ECONOMY.TARGET_SUPPLY, 1);
  nudge = nudge || 0;
  const ratio = totalCoins / ECONOMY.TARGET_SUPPLY;
  const raw = ECONOMY.BASE_RATE / (1 + Math.log(ratio)) + nudge;
  return +Math.min(ECONOMY.CEILING, Math.max(ECONOMY.FLOOR, raw)).toFixed(2);
}

// Call this every time a user earns or spends coins
// delta = +amount when earning, -amount when spending
function updateTotalCoins(delta) {
  if (!delta || isNaN(delta)) return Promise.resolve();
  return firebase.database().ref("stats/totalCoins").transaction(cur =>
    Math.max(0, (cur || 0) + delta)
  );
}

// Special events nudge the rate (Hacker win = -1.5, mass login = +0.3 etc)
function applyNudge(delta, label) {
  firebase.database().ref("stats/nudge").transaction(cur =>
    Math.min(8, Math.max(-8, (cur || 0) + delta))
  );
  if (label) {
    firebase.database().ref("stats/events").push({ label, delta, t: Date.now() });
  }
}

// Get full live rate snapshot
function subscribeToRate(callback) {
  firebase.database().ref("stats").on("value", snap => {
    const s = snap.val() || {};
    const totalCoins = s.totalCoins || ECONOMY.TARGET_SUPPLY;
    const nudge = s.nudge || 0;
    const rate = calcRate(totalCoins, nudge);
    let history = s.rateHistory
      ? (Array.isArray(s.rateHistory) ? s.rateHistory : Object.values(s.rateHistory))
      : [];
    const prev = history.length >= 2 ? history[history.length - 2].r : rate;
    const events = s.events ? Object.values(s.events).slice(-5).reverse() : [];
    callback({ rate, prev, totalCoins, nudge, history, events, lastUpdated: s.lastTick || 0 });
  });
}

// Self-throttled hourly drift tick — call once on page load
async function maybeTickEconomy() {
  try {
    const tickRef = firebase.database().ref("stats/lastTick");
    const snap = await tickRef.get();
    if (Date.now() - (snap.val() || 0) < 60 * 60 * 1000) return;
    const drift = (Math.random() * 2 - 1) * ECONOMY.DRIFT_MAX;
    await firebase.database().ref("stats/nudge").transaction(cur =>
      Math.min(8, Math.max(-8, (cur || 0) + drift))
    );
    const { rate } = await getLiveRate();
    await firebase.database().ref("stats/rateHistory").transaction(cur => {
      const arr = Array.isArray(cur) ? cur : (cur ? Object.values(cur) : []);
      arr.push({ r: rate, t: Date.now() });
      return arr.slice(-ECONOMY.HISTORY_POINTS);
    });
    await tickRef.set(Date.now());
  } catch (e) { /* silent */ }
}

// ── FORMATTING ───────────────────────────────────────────────
function fmtCoins(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtRate(r) { return "₹" + Number(r).toFixed(2); }
function pctChange(now, prev) {
  if (!prev) return 0;
  return +(((now - prev) / prev) * 100).toFixed(2);
}

// ── TOAST ────────────────────────────────────────────────────
function axToast(msg, type) {
  type = type || "success";
  let t = document.getElementById("ax-toast");
  if (!t) {
    t = document.createElement("div"); t.id = "ax-toast";
    t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(100px);
      background:#0f1117;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:13px 24px;
      font-family:'Syne',sans-serif;font-size:.9rem;font-weight:600;z-index:9999;
      transition:transform .45s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;pointer-events:none;
      display:flex;align-items:center;gap:8px;`;
    document.body.appendChild(t);
  }
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "💡";
  const color = type === "success" ? "#10d48e" : type === "error" ? "#ef4444" : "#f0b429";
  const bdr = type === "success" ? "rgba(16,212,142,.3)" : type === "error" ? "rgba(239,68,68,.3)" : "rgba(240,180,41,.3)";
  t.innerHTML = `<span>${icon}</span><span style="color:${color}">${msg}</span>`;
  t.style.borderColor = bdr;
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.transform = "translateX(-50%) translateY(100px)"; }, 3200);
}

// ── INJECT SHARED CSS ─────────────────────────────────────────
(function () {
  if (document.getElementById("ax-css")) return;
  const s = document.createElement("style"); s.id = "ax-css";
  s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
:root{
  --bg:#09090f;--surface:#0f1117;--s2:#14161f;--s3:#1a1d28;
  --border:rgba(255,255,255,.06);--b2:rgba(255,255,255,.1);
  --gold:#f0b429;--gold2:#c98a00;
  --green:#10d48e;--green2:#0aad73;
  --blue:#3b82f6;--purple:#8b5cf6;--red:#ef4444;--orange:#f97316;
  --text:#e8eaf0;--t2:#8a90a8;--t3:#4a5070;
  --ff:'Syne',sans-serif;--fm:'DM Mono',monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{font-family:var(--ff);background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;}
a{text-decoration:none;color:inherit;}
button{font-family:var(--ff);}
/* TOPBAR */
.ax-top{
  position:fixed;top:0;left:0;right:0;height:58px;
  background:rgba(9,9,15,.94);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 24px;z-index:1000;gap:12px;
}
.ax-logo{font-size:1.05rem;font-weight:800;letter-spacing:-.5px;color:var(--gold);}
.ax-top-mid{flex:1;display:flex;align-items:center;justify-content:center;}
.ax-top-r{display:flex;align-items:center;gap:8px;}
.ax-pill{
  font-family:var(--fm);font-size:.78rem;
  background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.2);
  color:var(--gold);padding:4px 13px;border-radius:999px;white-space:nowrap;
}
.ax-pill.green{background:rgba(16,212,142,.08);border-color:rgba(16,212,142,.2);color:var(--green);}
.ax-pill.red{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:var(--red);}
.ax-ghost{
  background:none;border:1px solid var(--b2);color:var(--t2);
  font-size:.82rem;font-weight:600;padding:6px 13px;border-radius:9px;
  cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:5px;
}
.ax-ghost:hover{color:var(--text);background:var(--s2);}
/* PAGE */
.ax-page{max-width:1060px;margin:0 auto;padding:76px 20px 60px;}
/* CARD */
.ax-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:24px;}
/* SCROLLBAR */
::-webkit-scrollbar{width:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px;}
/* RATE COLORS */
.up{color:var(--green)!important;}.down{color:var(--red)!important;}
/* PULSE */
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px);}to{opacity:1;transform:none;}}
.fade-up{animation:fadeUp .45s ease both;}
  `;
  document.head.appendChild(s);
})();
