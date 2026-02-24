/* auth.js — DanzStoreGaming Auth + Wallet (localStorage) + Firestore mirror (optional)
   FIX v3 (Feb 2026):
   - Buang semua code dock/confirm duplicate yang buat UI hilang.
   - Tambah Bottom-Right Drag Dock: default half-hidden (2/2), boleh tarik, auto-hide.
   - Auto open modal login jika belum login (sekali per tab), TANPA window.confirm.

   Public API (used by dashboard.js):
   - window.DSGAuth.openModal({forceRegister?})
   - window.DSGAuth.getSession()
   - window.DSGAuth.logout()
   - window.DSGAuth.normalizePhone(raw)
   - window.DSGAuth.wallet.getBalance(phone)
   - window.DSGAuth.wallet.setBalance(phone, amount)
*/

(function () {
  'use strict';

  // ===== VERSION (cache bust helper) =====
  window.DSG_AUTH_VERSION = 'v5.0.0';
  try{ console.log('[DSGAuth] loaded', window.DSG_AUTH_VERSION); }catch{}

  'use strict';

  // ===== Constants =====
  const LS_SESSION = 'DSG_AUTH';
  const LS_COUNTRY = 'DSG_COUNTRY';
  const USER_KEY_PREFIX = 'DSG_USER_';
  const OTP_PREFIX = 'DSG_OTP_';

  const SESSION_TTL_DAYS = 7;
  const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const LAST_ACTIVE_THROTTLE_MS = 30 * 1000;

  const OTP_TTL_MS = 5 * 60 * 1000;
  const OTP_RESEND_MS = 30 * 1000;

  // Auto popup login (once per tab)
  const SS_AUTOPOP = 'DSG_AUTH_AUTOPOP_SHOWN';

  const COUNTRIES = [
    { code: 'MY', dial: '60', flag: '🇲🇾', label: 'Malaysia' },
    { code: 'SG', dial: '65', flag: '🇸🇬', label: 'Singapore' },
    { code: 'ID', dial: '62', flag: '🇮🇩', label: 'Indonesia' },
  ];

  // ===== Firestore helpers (optional) =====
  function fsDb() {
    const fb = window.DSGFirebase;
    return fb && fb.enabled && fb.db ? fb.db : null;
  }
  function fsEnabled() {
    return !!fsDb();
  }
  function fsServerTimestamp() {
    const fb = window.DSGFirebase;
    return fb && fb.enabled && typeof fb.serverTimestamp === 'function' ? fb.serverTimestamp() : null;
  }

  async function fsGetUser(phone) {
    const db = fsDb();
    if (!db) return null;
    const p = normalizePhone(phone);
    const snap = await db.collection('users').doc(p).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async function fsSetUser(phone, data) {
    const db = fsDb();
    if (!db) return false;
    const p = normalizePhone(phone);
    await db.collection('users').doc(p).set({ ...data, phone: p }, { merge: true });
    return true;
  }

  async function fsEnsureWallet(phone) {
    const db = fsDb();
    if (!db) return false;
    const p = normalizePhone(phone);
    const ref = db.collection('wallets').doc(p);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(
        {
          phone: p,
          balance: 0,
          createdAt: fsServerTimestamp() || new Date().toISOString(),
          updatedAt: fsServerTimestamp() || new Date().toISOString(),
        },
        { merge: true }
      );
    }
    return true;
  }

  async function fsGetWallet(phone) {
    const db = fsDb();
    if (!db) return null;
    const p = normalizePhone(phone);
    const snap = await db.collection('wallets').doc(p).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return Number(d.balance || 0);
  }

  async function fsSetWallet(phone, amount) {
    const db = fsDb();
    if (!db) return false;
    const p = normalizePhone(phone);
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    await db
      .collection('wallets')
      .doc(p)
      .set(
        {
          phone: p,
          balance: safe,
          updatedAt: fsServerTimestamp() || new Date().toISOString(),
        },
        { merge: true }
      );
    return true;
  }

  async function syncFromFirestoreToLocal(phone) {
    if (!fsEnabled()) return;
    const p = normalizePhone(phone);

    try {
      const u = await fsGetUser(p);
      if (u) localStorage.setItem(userKey(p), JSON.stringify(u));
    } catch (e) {
      console.warn('[DSG Firestore] sync user failed', e);
    }

    try {
      const bal = await fsGetWallet(p);
      if (bal != null) {
        localStorage.setItem(`DSG_WALLET_${p}`, Number(bal).toFixed(2));
        window.dispatchEvent(
          new CustomEvent('dsg:wallet-changed', { detail: { phone: p, balance: Number(bal) } })
        );
      }
    } catch (e) {
      console.warn('[DSG Firestore] sync wallet failed', e);
    }
  }

  // ===== Country + normalize =====
  function getCountry() {
    try {
      const raw = localStorage.getItem(LS_COUNTRY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.code && c.dial) return c;
      }
    } catch {}
    return COUNTRIES[0];
  }

  function setCountry(code) {
    const c = COUNTRIES.find((x) => x.code === code) || COUNTRIES[0];
    try {
      localStorage.setItem(LS_COUNTRY, JSON.stringify(c));
    } catch {}
    return c;
  }

  function normalizeDigitsLocalMY(raw) {
    let p = String(raw || '').replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('00')) p = p.slice(2);
    if (p.startsWith('60')) p = p.slice(2);
    if (!p.startsWith('0')) p = '0' + p;
    return p;
  }

  function normalizePhone(raw) {
    const c = getCountry();

    if (c.code === 'MY') return normalizeDigitsLocalMY(raw);

    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith(c.dial)) return d;
    if (d.startsWith('00' + c.dial)) return d.slice(2);
    if (d.startsWith('0')) return c.dial + d.slice(1);
    return c.dial + d;
  }

  function countryLabel(c) {
    return `${c.flag} +${c.dial}`;
  }

  function applyCountryUI(root) {
    const c = getCountry();
    root.querySelectorAll('[data-country-btn]').forEach((b) => (b.textContent = countryLabel(c)));

    const ph =
      c.code === 'MY' ? 'contoh: 6011xxxxxxx / 01xxxxxxxx' : `contoh: +${c.dial}xxxxxxxxxx`;

    ['dsg-login-phone', 'dsg-reg-phone', 'dsg-forgot-phone'].forEach((id) => {
      const el = root.querySelector('#' + id);
      if (el && !el.dataset.userTouched) el.placeholder = ph;
    });
  }

  function initCountryPicker(root) {
    applyCountryUI(root);

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-country-btn]');
      if (btn) {
        const wrap = btn.closest('.dsg-auth-phonewrap');
        if (wrap) wrap.classList.toggle('open');
        e.preventDefault();
        return;
      }

      const item = e.target.closest('[data-country]');
      if (item) {
        const code = item.getAttribute('data-country');
        setCountry(code);
        applyCountryUI(root);
        root.querySelectorAll('.dsg-auth-phonewrap.open').forEach((w) => w.classList.remove('open'));
        e.preventDefault();
        return;
      }

      if (!e.target.closest('.dsg-auth-phonewrap')) {
        root.querySelectorAll('.dsg-auth-phonewrap.open').forEach((w) => w.classList.remove('open'));
      }
    });

    root.querySelectorAll("input[inputmode='tel']").forEach((inp) => {
      inp.addEventListener(
        'input',
        () => {
          inp.dataset.userTouched = '1';
        },
        { once: true }
      );
    });
  }

  // ===== OTP (demo/local) =====
  function isValidPin(pin) {
    return /^\d{6}$/.test(String(pin || '').trim());
  }
  function isValidOtp(code) {
    return /^\d{6}$/.test(String(code || '').trim());
  }

  function otpKey(phone, purpose) {
    const p = normalizePhone(phone);
    return `${OTP_PREFIX}${purpose}_${p}`;
  }
  function genOtp6() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function getOtpRecord(phone, purpose) {
    try {
      return JSON.parse(localStorage.getItem(otpKey(phone, purpose)) || 'null');
    } catch {
      return null;
    }
  }
  function setOtpRecord(phone, purpose, rec) {
    localStorage.setItem(otpKey(phone, purpose), JSON.stringify(rec));
  }
  function clearOtp(phone, purpose) {
    localStorage.removeItem(otpKey(phone, purpose));
  }

  function sendOtp(phone, purpose) {
    const p = normalizePhone(phone);
    const now = Date.now();

    const existing = getOtpRecord(p, purpose);
    if (existing?.sentAt && now - existing.sentAt < OTP_RESEND_MS) {
      return {
        ok: false,
        msg: `Tunggu ${Math.ceil((OTP_RESEND_MS - (now - existing.sentAt)) / 1000)}s sebelum resend.`,
      };
    }

    const code = genOtp6();
    const rec = {
      purpose,
      phone: p,
      code,
      sentAt: now,
      expiresAt: now + OTP_TTL_MS,
      verifiedAt: null,
    };
    setOtpRecord(p, purpose, rec);

    console.log(`[DSG OTP DEMO] purpose=${purpose} phone=${p} otp=${code}`);
    alert(`OTP (DEMO) untuk ${p}: ${code}\n\n*Ini demo. Nanti boleh sambung SMS API.*`);

    return { ok: true, msg: 'OTP dihantar (demo).' };
  }

  function verifyOtp(phone, purpose, input) {
    const p = normalizePhone(phone);
    const code = String(input || '').trim();
    if (!isValidOtp(code)) return { ok: false, msg: 'OTP mesti 6 digit.' };

    const rec = getOtpRecord(p, purpose);
    if (!rec) return { ok: false, msg: 'OTP belum dihantar. Tekan Send OTP dulu.' };
    if (Date.now() > rec.expiresAt) return { ok: false, msg: 'OTP dah expired. Sila resend.' };
    if (rec.code !== code) return { ok: false, msg: 'OTP salah.' };

    rec.verifiedAt = Date.now();
    setOtpRecord(p, purpose, rec);
    return { ok: true, msg: 'OTP verified.' };
  }

  // ===== User storage =====
  function userKey(phone) {
    return USER_KEY_PREFIX + phone;
  }

  function getUser(phone) {
    const p = normalizePhone(phone);
    const legacy = String(phone || '').trim().replace(/\s+/g, '');
    try {
      const v1 = localStorage.getItem(userKey(p));
      if (v1) return JSON.parse(v1);

      const v2 = localStorage.getItem(USER_KEY_PREFIX + legacy);
      if (v2) return JSON.parse(v2);

      return null;
    } catch {
      return null;
    }
  }

  function setUser(phone, userObj) {
    const p = normalizePhone(phone);
    localStorage.setItem(userKey(p), JSON.stringify(userObj));

    if (fsEnabled()) {
      fsSetUser(p, {
        ...userObj,
        phone: p,
        updatedAt: fsServerTimestamp() || new Date().toISOString(),
      }).catch((e) => console.warn('[DSG Firestore] setUser failed', e));
    }
  }

  // ===== Session =====
  function readSessionRaw() {
    try {
      return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    } catch {
      return null;
    }
  }

  function sessionIsExpired(s) {
    try {
      if (!s || !s.phone) return false;
      const last = s.lastActiveAt || s.loggedInAt;
      if (!last) return false;
      const lastMs = Date.parse(last);
      if (!Number.isFinite(lastMs)) return false;
      return Date.now() - lastMs > SESSION_TTL_MS;
    } catch {
      return false;
    }
  }

  function logout() {
    try {
      localStorage.removeItem(LS_SESSION);
    } catch {}
    window.dispatchEvent(new CustomEvent('dsg:auth-changed', { detail: { phone: null } }));
  }

  function getSession() {
    const s = readSessionRaw();
    if (sessionIsExpired(s)) {
      try {
        localStorage.removeItem(LS_SESSION);
      } catch {}
      window.dispatchEvent(new CustomEvent('dsg:auth-changed', { detail: { phone: null, expired: true } }));
      return null;
    }
    return s;
  }

  function setSession(phone) {
    const p = normalizePhone(phone);
    const now = new Date().toISOString();
    localStorage.setItem(LS_SESSION, JSON.stringify({ phone: p, loggedInAt: now, lastActiveAt: now }));
    window.dispatchEvent(new CustomEvent('dsg:auth-changed', { detail: { phone: p } }));

    syncFromFirestoreToLocal(p).catch(() => {});
    touchSession(true);
  }

  let __lastTouch = 0;
  function touchSession(force) {
    const s = readSessionRaw();
    if (!s?.phone) return;

    if (sessionIsExpired(s)) {
      logout();
      return;
    }

    const now = Date.now();
    if (!force && now - __lastTouch < LAST_ACTIVE_THROTTLE_MS) return;
    __lastTouch = now;

    try {
      s.lastActiveAt = new Date(now).toISOString();
      localStorage.setItem(LS_SESSION, JSON.stringify(s));
    } catch {}
  }

  function startSessionActivityListeners() {
    if (startSessionActivityListeners.__started) return;
    startSessionActivityListeners.__started = true;

    const onActivity = () => touchSession(false);
    ['click', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, onActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') touchSession(true);
    });

    touchSession(true);
  }

  // ===== Wallet (per phone) =====
  function ensureWallet(phone) {
    const p = normalizePhone(phone);
    const key = `DSG_WALLET_${p}`;
    const raw = localStorage.getItem(key);

    if (raw && raw.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(raw);
        const bal = Number(obj?.balance || 0);
        localStorage.setItem(key, (Number.isFinite(bal) ? bal : 0).toFixed(2));
        return;
      } catch {}
    }

    if (raw == null) {
      localStorage.setItem(key, '0.00');
      return;
    }

    const n = Number(raw);
    if (!Number.isFinite(n)) localStorage.setItem(key, '0.00');
  }

  function walletGet(phone) {
    const p = normalizePhone(phone);
    ensureWallet(p);
    const n = Number(localStorage.getItem(`DSG_WALLET_${p}`) || '0');
    return Number.isFinite(n) ? n : 0;
  }

  function walletSet(phone, amount) {
    const p = normalizePhone(phone);
    ensureWallet(p);
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    localStorage.setItem(`DSG_WALLET_${p}`, safe.toFixed(2));
    window.dispatchEvent(new CustomEvent('dsg:wallet-changed', { detail: { phone: p, balance: safe } }));

    if (fsEnabled()) {
      fsEnsureWallet(p)
        .then(() => fsSetWallet(p, safe))
        .catch((e) => console.warn('[DSG Firestore] walletSet failed', e));
    }
  }

  function walletAdd(phone, amount) {
    const bal = walletGet(phone);
    walletSet(phone, bal + Number(amount || 0));
    return walletGet(phone);
  }

  function walletDeduct(phone, amount) {
    const bal = walletGet(phone);
    const amt = Number(amount || 0);
    if (bal + 1e-9 < amt) return { ok: false, balance: bal };
    walletSet(phone, bal - amt);
    return { ok: true, balance: walletGet(phone) };
  }

  // ===== UI styles + modal =====
    function injectStyles() {
    const existing = document.getElementById('dsg-auth-style');
    if (existing) existing.remove();

    const st = document.createElement('style');
    st.id = 'dsg-auth-style';
    st.textContent = `
      :root{
        --dsg-bg-0:#070c12;
        --dsg-bg-1:#0b1220;
        --dsg-card:rgba(15,23,42,.72);
        --dsg-border:rgba(0,229,255,.22);
        --dsg-text:#e7f4ff;
        --dsg-muted:rgba(231,244,255,.75);
        --dsg-accent1:#00e5ff;
        --dsg-accent2:#7cffb2;
      }

      /* Remove blue tap highlight (mobile) */
      * { -webkit-tap-highlight-color: transparent; }
      a, button { -webkit-tap-highlight-color: transparent; }

            /* ===== Floating Auth Button (consistent on all pages) ===== */
      .dsg-auth-fab{
        position: fixed !important;
        right: 16px !important;
        bottom: 18px !important;
        z-index: 2147483640;

        width: 56px;
        height: 56px;
        border-radius: 999px;

        display:flex;
        align-items:center;
        justify-content:center;

        border:1px solid rgba(0,229,255,.28);
        background: radial-gradient(120% 120% at 0% 0%, rgba(0,229,255,.25), transparent 55%),
                    linear-gradient(135deg, rgba(11,18,32,.92), rgba(6,10,18,.92));
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);

        cursor:pointer;
        user-select:none;

        box-shadow:0 14px 30px rgba(0,0,0,.55), 0 0 0 1px rgba(0,229,255,.10) inset;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        touch-action: manipulation;
      }
      .dsg-auth-fab:hover{
        transform: translateY(-2px);
        border-color: rgba(0,229,255,.45);
        box-shadow:0 18px 36px rgba(0,0,0,.62), 0 0 18px rgba(0,229,255,.20);
      }
      .dsg-auth-fab:active{ transform: translateY(0px) scale(.98); }

      .dsg-auth-fab .ico{
        width: 40px;
        height: 40px;
        border-radius: 16px;

        display:flex;
        align-items:center;
        justify-content:center;

        border:1px solid rgba(255,255,255,.12);
        background:linear-gradient(90deg, rgba(0,229,255,.16), rgba(124,255,178,.10));
        box-shadow:0 0 0 1px rgba(0,229,255,.10) inset;

        font-weight:1000;
        color: var(--dsg-text);
        font-size: 18px;
        line-height: 1;
      }

      /* Safe area (iPhone) */
      @supports (padding: max(0px)){
        .dsg-auth-fab{
          bottom: max(18px, env(safe-area-inset-bottom));
          right: max(16px, env(safe-area-inset-right));
        }
      }

.dsg-auth-dock .txt{ min-width:0; }
        .dsg-auth-dock .txt .t2{ display:none; }
      }
    `;
    document.head.appendChild(st);
  }

    function renderModal() {
    // host (light DOM) - for toggling display
    let host = document.getElementById('dsg-auth-backdrop');
    if (host) return;

    host = document.createElement('div');
    host.id = 'dsg-auth-backdrop';
    // Keep host minimal; all UI/styling inside shadow so home/dashboard CSS can't kacau.
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '9999';
    host.style.display = 'none';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
      :host{ all: initial; }
      *, *::before, *::after { box-sizing:border-box; }
      .dsg-auth-backdrop{
        position:fixed; inset:0;
        background:rgba(2,6,23,.68);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display:flex;
        align-items:center; justify-content:center;
        padding:16px;
        font-family: inherit;
      }
      .dsg-auth-modal{
        width:min(560px, 100%);
        color:#e7f4ff;
        border:1px solid rgba(0,229,255,.22);
        border-radius:18px;
        padding:16px;
        background:
          radial-gradient(900px 400px at -10% -10%, rgba(0,229,255,.14), transparent 55%),
          radial-gradient(800px 380px at 110% 0%, rgba(124,255,178,.10), transparent 55%),
          linear-gradient(180deg, rgba(11,18,32,.92), rgba(7,12,18,.92));
        box-shadow:
          0 18px 70px rgba(0,0,0,.55),
          0 0 0 1px rgba(255,255,255,.06) inset;
        font-family: inherit;
      }
      .dsg-auth-top{display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;}
      .dsg-auth-title{font-size:20px; font-weight:900; letter-spacing:.2px;}
      .dsg-auth-close{
        width:38px; height:38px; border-radius:12px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#e7f4ff;
        font-size:22px; line-height:1;
        cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        opacity:.95;
      }
      .dsg-auth-close:active{ transform:scale(.98); }
      .dsg-auth-help{font-size:12px; color:rgba(231,244,255,.75); margin-top:6px; line-height:1.45;}
      .dsg-auth-tabs{display:flex; gap:10px; margin:12px 0 14px;}
      .dsg-auth-tab{
        flex:1; padding:10px 12px; border-radius:14px; cursor:pointer;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.04);
        color:#e7f4ff;
        font-weight:900; letter-spacing:.2px;
      }
      .dsg-auth-tab.active{
        border-color:rgba(0,229,255,.35);
        background:linear-gradient(90deg, rgba(0,229,255,.16), rgba(124,255,178,.10));
        box-shadow: 0 0 0 1px rgba(0,229,255,.10) inset;
      }
      .dsg-auth-row{display:flex; flex-direction:column; gap:6px; margin:10px 0;}
      .dsg-auth-row label{font-size:12px; color:rgba(231,244,255,.75); font-weight:700;}
      .dsg-auth-row input{
        -webkit-appearance:none; appearance:none;
        width:100%; padding:12px 12px; border-radius:14px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.05);
        color:#e7f4ff;
        outline:none;
      }
      .dsg-auth-row input:focus{ border-color:rgba(0,229,255,.45); box-shadow: 0 0 0 3px rgba(0,229,255,.14); }
      .dsg-auth-actions{display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;}
      .dsg-auth-btn{
        -webkit-appearance:none; appearance:none;
        flex:1; min-width:160px;
        padding:12px 12px;
        border-radius:999px;
        border:0;
        background:linear-gradient(90deg, #00e5ff, #7cffb2);
        color:#032a2f;
        font-weight:1000;
        letter-spacing:.3px;
        cursor:pointer;
        box-shadow: 0 12px 28px rgba(0,0,0,.35);
      }
      .dsg-auth-btn:active{ transform:scale(.985); }
      .dsg-auth-btn.secondary{
        background:rgba(255,255,255,.07);
        color:#e7f4ff;
        border:1px solid rgba(255,255,255,.14);
        box-shadow:none;
        font-weight:900;
      }
      .dsg-auth-link{display:inline-block; margin-top:10px; font-size:12px; color:#9ad7ff; cursor:pointer; text-decoration:underline; opacity:.95;}
      .dsg-auth-error{margin-top:10px; color:#ffb4b4; font-size:12px; min-height:16px;}

      .dsg-auth-phonewrap{ position:relative; display:flex; gap:10px; align-items:center; width:100%; }
      .dsg-auth-phonewrap input{ flex:1; min-width:0; }
      .dsg-country-btn{
        flex:0 0 auto;
        padding:12px 14px;
        border-radius:14px;
        border:1px solid rgba(0,229,255,.22);
        background:rgba(0,0,0,.28);
        color:#e7f4ff;
        font-weight:900;
        letter-spacing:.2px;
        cursor:pointer;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
      }
      .dsg-country-menu{
        position:absolute;
        top:100%; left:0;
        margin-top:10px;
        width:min(320px, 100%);
        border-radius:16px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(8,12,20,.98);
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden;
        display:none;
        z-index:99999;
        backdrop-filter: blur(12px);
      }
      .dsg-auth-phonewrap.open .dsg-country-menu{ display:block; }
      .dsg-country-item{ width:100%; text-align:left; padding:12px 14px; border:0; background:transparent; color:#e7f4ff; font-weight:800; cursor:pointer; }
      .dsg-country-item:hover{ background:rgba(0,229,255,.08); }

      /* Remove blue tap highlight (mobile) */
      * { -webkit-tap-highlight-color: transparent; }
      a, button { -webkit-tap-highlight-color: transparent; }
</style>
      <div class="dsg-auth-backdrop" part="backdrop">
        <div class="dsg-auth-modal" role="dialog" aria-modal="true">
          <div class="dsg-auth-top">
            <div>
              <div class="dsg-auth-title">Login / Register</div>
              <div class="dsg-auth-help">
                <b>Login</b>: No Phone + 6-digit PIN (tiada OTP).<br/>
                <b>Register/Forgot PIN</b>: guna OTP untuk verify nombor.
              </div>
            </div>
            <button class="dsg-auth-close" id="dsg-auth-close" aria-label="Close">×</button>
          </div>

          <div class="dsg-auth-tabs">
            <button class="dsg-auth-tab active" id="dsg-tab-login" type="button">Login</button>
            <button class="dsg-auth-tab" id="dsg-tab-register" type="button">Register</button>
          </div>

          <div id="dsg-auth-form-login">
            <div class="dsg-auth-row">
              <label>No Phone</label>
              <div class="dsg-auth-phonewrap">
                <button class="dsg-country-btn" type="button" data-country-btn>🇲🇾 +60</button>
                <div class="dsg-country-menu" data-country-menu>
                  <button type="button" class="dsg-country-item" data-country="MY">🇲🇾 Malaysia (+60)</button>
                  <button type="button" class="dsg-country-item" data-country="SG">🇸🇬 Singapore (+65)</button>
                  <button type="button" class="dsg-country-item" data-country="ID">🇮🇩 Indonesia (+62)</button>
                </div>
                <input id="dsg-login-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
              </div>
            </div>
            <div class="dsg-auth-row">
              <label>6-digit PIN</label>
              <input id="dsg-login-pin" placeholder="******" inputmode="numeric" maxlength="6" />
            </div>
            <div class="dsg-auth-actions">
              <button class="dsg-auth-btn" id="dsg-btn-login" type="button">Login</button>
              <button class="dsg-auth-btn secondary" id="dsg-btn-cancel1" type="button">Cancel</button>
            </div>
            <span class="dsg-auth-link" id="dsg-link-forgot">Forgot PIN? (guna OTP)</span>
          </div>

          <div id="dsg-auth-form-register" style="display:none">
            <div class="dsg-auth-row">
              <label>No Phone</label>
              <div class="dsg-auth-phonewrap">
                <button class="dsg-country-btn" type="button" data-country-btn>🇲🇾 +60</button>
                <div class="dsg-country-menu" data-country-menu>
                  <button type="button" class="dsg-country-item" data-country="MY">🇲🇾 Malaysia (+60)</button>
                  <button type="button" class="dsg-country-item" data-country="SG">🇸🇬 Singapore (+65)</button>
                  <button type="button" class="dsg-country-item" data-country="ID">🇮🇩 Indonesia (+62)</button>
                </div>
                <input id="dsg-reg-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
              </div>
            </div>

            <div class="dsg-auth-row" id="dsg-reg-otp-row" style="display:none">
              <label>OTP (6 digit)</label>
              <input id="dsg-reg-otp" placeholder="123456" inputmode="numeric" maxlength="6" />
            </div>

            <div class="dsg-auth-row">
              <label>Set 6-digit PIN</label>
              <input id="dsg-reg-pin" placeholder="******" inputmode="numeric" maxlength="6" />
            </div>
            <div class="dsg-auth-row">
              <label>Confirm PIN</label>
              <input id="dsg-reg-pin2" placeholder="******" inputmode="numeric" maxlength="6" />
            </div>

            <div class="dsg-auth-actions">
              <button class="dsg-auth-btn secondary" id="dsg-btn-reg-sendotp" type="button">Send OTP</button>
              <button class="dsg-auth-btn" id="dsg-btn-register" type="button">Verify OTP & Create</button>
              <button class="dsg-auth-btn secondary" id="dsg-btn-cancel2" type="button">Cancel</button>
            </div>
          </div>

          <div id="dsg-auth-form-forgot" style="display:none">
            <div class="dsg-auth-row">
              <label>No Phone</label>
              <div class="dsg-auth-phonewrap">
                <button class="dsg-country-btn" type="button" data-country-btn>🇲🇾 +60</button>
                <div class="dsg-country-menu" data-country-menu>
                  <button type="button" class="dsg-country-item" data-country="MY">🇲🇾 Malaysia (+60)</button>
                  <button type="button" class="dsg-country-item" data-country="SG">🇸🇬 Singapore (+65)</button>
                  <button type="button" class="dsg-country-item" data-country="ID">🇮🇩 Indonesia (+62)</button>
                </div>
                <input id="dsg-forgot-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
              </div>
            </div>

            <div class="dsg-auth-row" id="dsg-forgot-otp-row" style="display:none">
              <label>OTP (6 digit)</label>
              <input id="dsg-forgot-otp" placeholder="123456" inputmode="numeric" maxlength="6" />
            </div>

            <div class="dsg-auth-row">
              <label>New 6-digit PIN</label>
              <input id="dsg-forgot-pin" placeholder="******" inputmode="numeric" maxlength="6" />
            </div>
            <div class="dsg-auth-row">
              <label>Confirm New PIN</label>
              <input id="dsg-forgot-pin2" placeholder="******" inputmode="numeric" maxlength="6" />
            </div>

            <div class="dsg-auth-actions">
              <button class="dsg-auth-btn secondary" id="dsg-btn-forgot-sendotp" type="button">Send OTP</button>
              <button class="dsg-auth-btn" id="dsg-btn-forgot-reset" type="button">Verify OTP & Reset PIN</button>
              <button class="dsg-auth-btn secondary" id="dsg-btn-forgot-back" type="button">Back</button>
            </div>
          </div>

          <div class="dsg-auth-error" id="dsg-auth-error"></div>
        </div>
      </div>
    `;

    const backdrop = shadow.querySelector('.dsg-auth-backdrop');
    initCountryPicker(backdrop);

    const $ = (id) => shadow.getElementById(id);

    function setError(msg) {
      const el = $('dsg-auth-error');
      if (el) el.textContent = msg || '';
    }

    function close() {
      host.style.display = 'none';
      setError('');
    }

    function showLogin() {
      $('dsg-tab-login')?.classList.add('active');
      $('dsg-tab-register')?.classList.remove('active');
      $('dsg-auth-form-login').style.display = '';
      $('dsg-auth-form-register').style.display = 'none';
      $('dsg-auth-form-forgot').style.display = 'none';
      setError('');
    }

    function showRegister() {
      $('dsg-tab-register')?.classList.add('active');
      $('dsg-tab-login')?.classList.remove('active');
      $('dsg-auth-form-register').style.display = '';
      $('dsg-auth-form-login').style.display = 'none';
      $('dsg-auth-form-forgot').style.display = 'none';
      $('dsg-reg-otp-row').style.display = 'none';
      $('dsg-reg-otp').value = '';
      setError('');
    }

    function showForgot() {
      $('dsg-auth-form-forgot').style.display = '';
      $('dsg-auth-form-login').style.display = 'none';
      $('dsg-auth-form-register').style.display = 'none';
      $('dsg-forgot-otp-row').style.display = 'none';
      $('dsg-forgot-otp').value = '';
      setError('');
    }

    $('dsg-tab-login')?.addEventListener('click', showLogin);
    $('dsg-tab-register')?.addEventListener('click', showRegister);

    $('dsg-auth-close')?.addEventListener('click', close);
    $('dsg-btn-cancel1')?.addEventListener('click', close);
    $('dsg-btn-cancel2')?.addEventListener('click', close);

    $('dsg-link-forgot')?.addEventListener('click', showForgot);
    $('dsg-btn-forgot-back')?.addEventListener('click', showLogin);

    // ===== LOGIN =====
    $('dsg-btn-login')?.addEventListener('click', async () => {
      const phone = normalizePhone($('dsg-login-phone').value);
      const pin = String($('dsg-login-pin').value || '').trim();

      if (!phone) return setError('Sila isi No Phone.');
      if (!isValidPin(pin)) return setError('PIN mesti 6 digit nombor.');

      let u = getUser(phone);
      if (!u && fsEnabled()) {
        try {
          const fu = await fsGetUser(phone);
          if (fu) u = fu;
        } catch {}
      }

      if (!u) return setError('Nombor ini belum register. Pergi tab Register.');
      if (u.pin !== pin) return setError('PIN salah. Cuba lagi.');

      ensureWallet(phone);
      if (fsEnabled()) fsEnsureWallet(phone).catch(() => {});

      setSession(phone);
      close();
    });

    // ===== REGISTER: Send OTP =====
    $('dsg-btn-reg-sendotp')?.addEventListener('click', () => {
      const phone = normalizePhone($('dsg-reg-phone').value);
      if (!phone) return setError('Sila isi No Phone.');

      const exists = getUser(phone);
      if (exists) return setError('Nombor ini dah ada. Pergi tab Login.');

      const res = sendOtp(phone, 'register');
      if (!res.ok) return setError(res.msg);

      $('dsg-reg-otp-row').style.display = '';
      setError('✅ OTP dihantar. Sila masukkan OTP.');
    });

    // ===== REGISTER: Verify OTP & Create =====
    $('dsg-btn-register')?.addEventListener('click', () => {
      const phone = normalizePhone($('dsg-reg-phone').value);
      const otp = String($('dsg-reg-otp').value || '').trim();
      const pin = String($('dsg-reg-pin').value || '').trim();
      const pin2 = String($('dsg-reg-pin2').value || '').trim();

      if (!phone) return setError('Sila isi No Phone.');
      if (getUser(phone)) return setError('Nombor ini dah ada. Pergi tab Login.');

      $('dsg-reg-otp-row').style.display = '';
      if (!otp) return setError('Sila isi OTP. (Tekan Send OTP dulu kalau belum)');
      const v = verifyOtp(phone, 'register', otp);
      if (!v.ok) return setError(v.msg);

      if (!isValidPin(pin)) return setError('PIN mesti 6 digit nombor.');
      if (pin !== pin2) return setError('Confirm PIN tak sama.');

      const now = new Date().toISOString();
      setUser(phone, {
        phone: normalizePhone(phone),
        pin,
        createdAt: now,
        updatedAt: now,
      });
      ensureWallet(phone);

      if (fsEnabled()) {
        fsSetUser(phone, {
          phone: normalizePhone(phone),
          pin,
          createdAt: fsServerTimestamp() || now,
          updatedAt: fsServerTimestamp() || now,
        }).catch(() => {});
        fsEnsureWallet(phone).catch(() => {});
      }

      clearOtp(phone, 'register');
      setSession(phone);
      close();
    });

    // ===== FORGOT: Send OTP =====
    $('dsg-btn-forgot-sendotp')?.addEventListener('click', () => {
      const phone = normalizePhone($('dsg-forgot-phone').value);
      if (!phone) return setError('Sila isi No Phone.');

      const u = getUser(phone);
      if (!u) return setError('Nombor ini belum register. Tak boleh reset PIN.');

      const res = sendOtp(phone, 'forgot');
      if (!res.ok) return setError(res.msg);

      $('dsg-forgot-otp-row').style.display = '';
      setError('✅ OTP dihantar. Sila masukkan OTP.');
    });

    // ===== FORGOT: Verify OTP & Reset =====
    $('dsg-btn-forgot-reset')?.addEventListener('click', () => {
      const phone = normalizePhone($('dsg-forgot-phone').value);
      const otp = String($('dsg-forgot-otp').value || '').trim();
      const pin = String($('dsg-forgot-pin').value || '').trim();
      const pin2 = String($('dsg-forgot-pin2').value || '').trim();

      if (!phone) return setError('Sila isi No Phone.');

      const u = getUser(phone);
      if (!u) return setError('Nombor ini belum register. Tak boleh reset PIN.');

      $('dsg-forgot-otp-row').style.display = '';
      if (!otp) return setError('Sila isi OTP. (Tekan Send OTP dulu kalau belum)');
      const v = verifyOtp(phone, 'forgot', otp);
      if (!v.ok) return setError(v.msg);

      if (!isValidPin(pin)) return setError('PIN mesti 6 digit nombor.');
      if (pin !== pin2) return setError('Confirm PIN tak sama.');

      const now = new Date().toISOString();
      setUser(phone, { ...u, phone: normalizePhone(phone), pin, updatedAt: now });

      if (fsEnabled()) {
        fsSetUser(phone, {
          ...u,
          phone: normalizePhone(phone),
          pin,
          updatedAt: fsServerTimestamp() || now,
        }).catch(() => {});
      }

      clearOtp(phone, 'forgot');
      setSession(phone);
      close();
    });

    // close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    // expose internal helpers
    renderModal.__close = close;
    renderModal.__showLogin = showLogin;
    renderModal.__showRegister = showRegister;
  }



  function openModal(opts) {
    injectStyles();
    renderModal();

    const backdrop = document.getElementById('dsg-auth-backdrop');
    if (!backdrop) return;

    backdrop.style.display = 'block';

    // default view
    if (opts && opts.forceRegister) {
      renderModal.__showRegister?.();
    } else {
      renderModal.__showLogin?.();
    }
  }

  // ===== Drag Dock (bottom-right, half hidden) =====
    // ===== Floating Button (consistent across all pages) =====
  function ensureAuthFab() {
    injectStyles();

    if (document.getElementById('dsg-auth-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'dsg-auth-fab';
    fab.className = 'dsg-auth-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Login / Account');
    fab.setAttribute('title', 'Login / Account');
    document.body.appendChild(fab);

    function render() {
      const s = getSession();
      const isIn = !!s?.phone;
      fab.innerHTML = `<div class="ico">${isIn ? '✅' : '🔒'}</div>`;
      fab.setAttribute('aria-label', isIn ? 'Account' : 'Login');
    }

    fab.addEventListener('click', (e) => {
      e.preventDefault();
      openModal({});
    });

    // Right click / long press => logout (if logged in)
    fab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const s = getSession();
      if (s?.phone) logout();
    });

    window.addEventListener('dsg:auth-changed', render);
    render();
  }

// ===== Auto popup (custom modal) =====
  function autoPopupIfNotLoggedIn() {
    if (window.DSG_AUTH_AUTOPOPUP === false) return;
    const s = getSession();
    if (s?.phone) return;

    try {
      if (sessionStorage.getItem(SS_AUTOPOP) === '1') return;
      sessionStorage.setItem(SS_AUTOPOP, '1');
    } catch {}

    // small delay so DOM ready
    setTimeout(() => openModal({}), 250);
  }

  // ===== Init =====
  function init() {
    startSessionActivityListeners();
    ensureAuthFab();
    autoPopupIfNotLoggedIn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===== Public API =====
  window.DSGAuth = {
    normalizePhone,
    openModal,
    getSession,
    logout,
    wallet: {
      getBalance: walletGet,
      setBalance: walletSet,
      add: walletAdd,
      deduct: walletDeduct,
    },
  };
})();
