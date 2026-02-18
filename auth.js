/* auth.js — DanzStoreGaming simple auth (localStorage)
   - Register (first time): phone + OTP + 6-digit PIN
   - Login: phone + 6-digit PIN (NO OTP)
   - Forgot PIN: phone + OTP + new 6-digit PIN
   - Session stored in localStorage (DSG_AUTH)
*/

(function () {
  const LS_SESSION = "DSG_AUTH";
  const USER_KEY_PREFIX = "DSG_USER_";

  // ===== OTP (DEMO / local-only) =====
  const OTP_PREFIX = "DSG_OTP_";         // DSG_OTP_<purpose>_<phone>
  const OTP_TTL_MS = 5 * 60 * 1000;      // 5 min
  const OTP_RESEND_MS = 30 * 1000;       // 30 sec throttle

  function normalizeDigitsLocalMY(raw) {
    let p = String(raw || "").replace(/\D/g, "");
    if (!p) return "";
    if (p.startsWith("00")) p = p.slice(2);
    if (p.startsWith("60")) p = p.slice(2); // convert 60.. -> 0..
    if (!p.startsWith("0")) p = "0" + p;
    return p;
  }

  function normalizePhone(raw) {
    return normalizeDigitsLocalMY(raw);
  }

  function isValidPin(pin) {
    return /^\d{6}$/.test(String(pin || "").trim());
  }

  function isValidOtp(code) {
    return /^\d{6}$/.test(String(code || "").trim());
  }

  function userKey(phone) {
    return USER_KEY_PREFIX + phone;
  }

  // ✅ FIXED getUser (buang extra catch yang buat syntax error)
  function getUser(phone) {
    const p = normalizePhone(phone);
    const legacy = String(phone || "").trim().replace(/\s+/g, "");
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
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    } catch {
      return null;
    }
  }

  function setSession(phone) {
    const p = normalizePhone(phone);
    localStorage.setItem(
      LS_SESSION,
      JSON.stringify({ phone: p, loggedInAt: new Date().toISOString() })
    );
    window.dispatchEvent(new CustomEvent("dsg:auth-changed", { detail: { phone: p } }));
  }

  function logout() {
    localStorage.removeItem(LS_SESSION);
    window.dispatchEvent(new CustomEvent("dsg:auth-changed", { detail: { phone: null } }));
  }

  // ===== Wallet (per phone) =====
  function ensureWallet(phone) {
    const p = normalizePhone(phone);
    const key = `DSG_WALLET_${p}`;
    const raw = localStorage.getItem(key);

    // migrate old JSON wallet -> number string
    if (raw && raw.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(raw);
        const bal = Number(obj?.balance || 0);
        localStorage.setItem(key, (Number.isFinite(bal) ? bal : 0).toFixed(2));
        return;
      } catch (e) {}
    }

    if (raw == null) {
      localStorage.setItem(key, "0.00");
      return;
    }

    const n = Number(raw);
    if (!Number.isFinite(n)) localStorage.setItem(key, "0.00");
  }

  function walletGet(phone) {
    const p = normalizePhone(phone);
    ensureWallet(p);
    const n = Number(localStorage.getItem(`DSG_WALLET_${p}`) || "0");
    return Number.isFinite(n) ? n : 0;
  }

  function walletSet(phone, amount) {
    const p = normalizePhone(phone);
    ensureWallet(p);
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    localStorage.setItem(`DSG_WALLET_${p}`, safe.toFixed(2));
    window.dispatchEvent(new CustomEvent("dsg:wallet-changed", { detail: { phone: p, balance: safe } }));
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

  // ===== OTP helpers (DEMO) =====
  function otpKey(phone, purpose) {
    const p = normalizePhone(phone);
    return `${OTP_PREFIX}${purpose}_${p}`;
  }

  function genOtp6() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function getOtpRecord(phone, purpose) {
    try {
      return JSON.parse(localStorage.getItem(otpKey(phone, purpose)) || "null");
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
      return { ok: false, msg: `Tunggu ${Math.ceil((OTP_RESEND_MS - (now - existing.sentAt)) / 1000)}s sebelum resend.` };
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

    // DEMO: papar OTP (nanti ganti ke SMS API)
    console.log(`[DSG OTP DEMO] purpose=${purpose} phone=${p} otp=${code}`);
    alert(`OTP (DEMO) untuk ${p}: ${code}\n\n*Ini demo. Nanti boleh sambung SMS API.*`);

    return { ok: true, msg: "OTP dihantar (demo)." };
  }

  function verifyOtp(phone, purpose, input) {
    const p = normalizePhone(phone);
    const code = String(input || "").trim();
    if (!isValidOtp(code)) return { ok: false, msg: "OTP mesti 6 digit." };

    const rec = getOtpRecord(p, purpose);
    if (!rec) return { ok: false, msg: "OTP belum dihantar. Tekan Send OTP dulu." };
    if (Date.now() > rec.expiresAt) return { ok: false, msg: "OTP dah expired. Sila resend." };
    if (rec.code !== code) return { ok: false, msg: "OTP salah." };

    rec.verifiedAt = Date.now();
    setOtpRecord(p, purpose, rec);
    return { ok: true, msg: "OTP verified." };
  }

  function isOtpVerified(phone, purpose) {
    const rec = getOtpRecord(phone, purpose);
    if (!rec?.verifiedAt) return false;
    if (Date.now() > rec.expiresAt) return false;
    return true;
  }

  // ===== UI =====
  function injectStyles() {
  // Replace previous injected style so updates always apply
  const existing = document.getElementById("dsg-auth-style");
  if (existing) existing.remove();

  const st = document.createElement("style");
  st.id = "dsg-auth-style";
  st.textContent = `
    :root{
      --dsg-bg-0:#070c12;
      --dsg-bg-1:#0b1220;
      --dsg-card:rgba(15,23,42,.72);
      --dsg-border:rgba(0,229,255,.22);
      --dsg-border-soft:rgba(255,255,255,.12);
      --dsg-text:#e7f4ff;
      --dsg-muted:rgba(231,244,255,.75);
      --dsg-input:rgba(255,255,255,.06);
      --dsg-accent1:#00e5ff;
      --dsg-accent2:#7cffb2;
    }

    .dsg-auth-backdrop{
      position:fixed; inset:0;
      background:rgba(2,6,23,.68);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display:none;
      align-items:center; justify-content:center;
      z-index:9999;
      padding:16px;
    }

    .dsg-auth-modal{
      width:min(560px, 100%);
      color:var(--dsg-text);
      border:1px solid var(--dsg-border);
      border-radius:18px;
      padding:16px;
      background:
        radial-gradient(900px 400px at -10% -10%, rgba(0,229,255,.14), transparent 55%),
        radial-gradient(800px 380px at 110% 0%, rgba(124,255,178,.10), transparent 55%),
        linear-gradient(180deg, rgba(11,18,32,.92), rgba(7,12,18,.92));
      box-shadow:
        0 18px 70px rgba(0,0,0,.55),
        0 0 0 1px rgba(255,255,255,.06) inset;
      font-family: inherit; /* ikut site font, bukan system UI */
    }

    .dsg-auth-top{
      display:flex; justify-content:space-between; align-items:flex-start;
      gap:12px; margin-bottom:10px;
    }

    .dsg-auth-title{
      font-size:20px; font-weight:900; letter-spacing:.2px;
    }

    .dsg-auth-close{
      width:38px; height:38px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:var(--dsg-text);
      font-size:22px; line-height:1;
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      opacity:.95;
    }
    .dsg-auth-close:active{ transform:scale(.98); }

    .dsg-auth-help{
      font-size:12px;
      color:var(--dsg-muted);
      margin-top:6px;
      line-height:1.45;
    }

    .dsg-auth-tabs{
      display:flex; gap:10px; margin:12px 0 14px;
    }
    .dsg-auth-tab{
      flex:1;
      padding:10px 12px;
      border-radius:14px;
      cursor:pointer;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.04);
      color:var(--dsg-text);
      font-weight:900;
      letter-spacing:.2px;
    }
    .dsg-auth-tab.active{
      border-color:rgba(0,229,255,.35);
      background:linear-gradient(90deg, rgba(0,229,255,.16), rgba(124,255,178,.10));
      box-shadow: 0 0 0 1px rgba(0,229,255,.10) inset;
    }

    .dsg-auth-row{display:flex; flex-direction:column; gap:6px; margin:10px 0;}
    .dsg-auth-row label{font-size:12px; color:var(--dsg-muted); font-weight:700;}

    .dsg-auth-row input{
      -webkit-appearance:none; appearance:none;
      width:100%;
      padding:12px 12px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.05);
      color:var(--dsg-text);
      outline:none;
    }
    .dsg-auth-row input::placeholder{ color:rgba(231,244,255,.45); }
    .dsg-auth-row input:focus{
      border-color:rgba(0,229,255,.45);
      box-shadow: 0 0 0 3px rgba(0,229,255,.14);
    }

    .dsg-auth-actions{
      display:flex;
      gap:10px;
      margin-top:14px;
      flex-wrap:wrap;
    }

    .dsg-auth-btn{
      -webkit-appearance:none; appearance:none;
      flex:1; min-width:160px;
      padding:12px 12px;
      border-radius:999px;
      border:0;
      background:linear-gradient(90deg, var(--dsg-accent1), var(--dsg-accent2));
      color:#032a2f;
      font-weight:1000;
      letter-spacing:.3px;
      cursor:pointer;
      box-shadow: 0 12px 28px rgba(0,0,0,.35);
    }
    .dsg-auth-btn:active{ transform:scale(.985); }

    .dsg-auth-btn.secondary{
      background:rgba(255,255,255,.07);
      color:var(--dsg-text);
      border:1px solid rgba(255,255,255,.14);
      box-shadow:none;
      font-weight:900;
    }

    .dsg-auth-link{
      display:inline-block;
      margin-top:10px;
      font-size:12px;
      color:#9ad7ff;
      cursor:pointer;
      text-decoration:underline;
      opacity:.95;
    }

    .dsg-auth-error{
      margin-top:10px;
      color:#ffb4b4;
      font-size:12px;
      min-height:16px;
    }

    /* mini login/logout chip (bawah kanan) — ikut theme gelap */
    .dsg-auth-mini{
      position:fixed; right:14px; bottom:14px; z-index:9998;
      padding:10px 12px;
      border-radius:16px;
      background:rgba(11,18,32,.92);
      color:rgba(231,244,255,.86);
      border:1px solid rgba(0,229,255,.22);
      box-shadow:0 14px 40px rgba(0,0,0,.35);
      font-size:12px;
      font-family: inherit;
      display:flex; gap:10px; align-items:center;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .dsg-auth-mini b{ color:var(--dsg-text); font-weight:900; }

    .dsg-auth-mini button{
      -webkit-appearance:none; appearance:none;
      border:0;
      border-radius:999px;
      padding:7px 12px;
      cursor:pointer;
      background:linear-gradient(90deg, var(--dsg-accent1), var(--dsg-accent2));
      color:#032a2f;
      font-weight:1000;
    }
    .dsg-auth-mini button:active{ transform:scale(.98); }
  `;
  document.head.appendChild(st);
}

  function renderModal() {
    if (document.getElementById("dsg-auth-backdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.className = "dsg-auth-backdrop";
    backdrop.id = "dsg-auth-backdrop";

    backdrop.innerHTML = `
      <div class="dsg-auth-modal" role="dialog" aria-modal="true">
        <div class="dsg-auth-top">
          <div>
            <div class="dsg-auth-title">Login / Register</div>
            <div class="dsg-auth-help">
              <b>Login</b>: No Phone + 6-digit PIN (tiada OTP).
              <br/>
              <b>Register/Forgot PIN</b>: guna OTP untuk verify nombor.
            </div>
          </div>
          <button class="dsg-auth-close" id="dsg-auth-close" aria-label="Close">×</button>
        </div>

        <div class="dsg-auth-tabs">
          <button class="dsg-auth-tab active" id="dsg-tab-login" type="button">Login</button>
          <button class="dsg-auth-tab" id="dsg-tab-register" type="button">Register</button>
        </div>

        <!-- LOGIN -->
        <div id="dsg-auth-form-login">
          <div class="dsg-auth-row">
            <label>No Phone</label>
            <input id="dsg-login-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
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

        <!-- REGISTER -->
        <div id="dsg-auth-form-register" style="display:none">
          <div class="dsg-auth-row">
            <label>No Phone</label>
            <input id="dsg-reg-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
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

        <!-- FORGOT PIN -->
        <div id="dsg-auth-form-forgot" style="display:none">
          <div class="dsg-auth-row">
            <label>No Phone</label>
            <input id="dsg-forgot-phone" placeholder="contoh: 6011xxxxxxx / 01xxxxxxxx" inputmode="tel" />
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
    `;

    document.body.appendChild(backdrop);

    const $ = (id) => document.getElementById(id);

    function setError(msg) {
      $("dsg-auth-error").textContent = msg || "";
    }

    function close() {
      backdrop.style.display = "none";
      setError("");
    }

    function showLogin() {
      $("dsg-tab-login").classList.add("active");
      $("dsg-tab-register").classList.remove("active");

      $("dsg-auth-form-login").style.display = "";
      $("dsg-auth-form-register").style.display = "none";
      $("dsg-auth-form-forgot").style.display = "none";
      setError("");
    }

    function showRegister() {
      $("dsg-tab-register").classList.add("active");
      $("dsg-tab-login").classList.remove("active");

      $("dsg-auth-form-register").style.display = "";
      $("dsg-auth-form-login").style.display = "none";
      $("dsg-auth-form-forgot").style.display = "none";

      // reset UI
      $("dsg-reg-otp-row").style.display = "none";
      $("dsg-reg-otp").value = "";
      setError("");
    }

    function showForgot() {
      $("dsg-auth-form-forgot").style.display = "";
      $("dsg-auth-form-login").style.display = "none";
      $("dsg-auth-form-register").style.display = "none";

      $("dsg-forgot-otp-row").style.display = "none";
      $("dsg-forgot-otp").value = "";
      setError("");
    }

    $("dsg-tab-login").addEventListener("click", showLogin);
    $("dsg-tab-register").addEventListener("click", showRegister);

    $("dsg-auth-close").addEventListener("click", close);
    $("dsg-btn-cancel1").addEventListener("click", close);
    $("dsg-btn-cancel2").addEventListener("click", close);

    $("dsg-link-forgot").addEventListener("click", showForgot);
    $("dsg-btn-forgot-back").addEventListener("click", showLogin);

    // ===== LOGIN (NO OTP) =====
    $("dsg-btn-login").addEventListener("click", () => {
      const phone = normalizePhone($("dsg-login-phone").value);
      const pin = String($("dsg-login-pin").value || "").trim();

      if (!phone) return setError("Sila isi No Phone.");
      if (!isValidPin(pin)) return setError("PIN mesti 6 digit nombor.");

      const u = getUser(phone);
      if (!u) return setError("Nombor ini belum register. Pergi tab Register.");
      if (u.pin !== pin) return setError("PIN salah. Cuba lagi.");

      ensureWallet(phone);
      setSession(phone);
      close();
    });

    // ===== REGISTER: Send OTP =====
    $("dsg-btn-reg-sendotp").addEventListener("click", () => {
      const phone = normalizePhone($("dsg-reg-phone").value);
      if (!phone) return setError("Sila isi No Phone.");

      const exists = getUser(phone);
      if (exists) return setError("Nombor ini dah ada. Pergi tab Login.");

      const res = sendOtp(phone, "register");
      if (!res.ok) return setError(res.msg);

      $("dsg-reg-otp-row").style.display = "";
      setError("✅ OTP dihantar. Sila masukkan OTP.");
    });

    // ===== REGISTER: Verify OTP & Create =====
    $("dsg-btn-register").addEventListener("click", () => {
      const phone = normalizePhone($("dsg-reg-phone").value);
      const otp = String($("dsg-reg-otp").value || "").trim();
      const pin = String($("dsg-reg-pin").value || "").trim();
      const pin2 = String($("dsg-reg-pin2").value || "").trim();

      if (!phone) return setError("Sila isi No Phone.");

      const exists = getUser(phone);
      if (exists) return setError("Nombor ini dah ada. Pergi tab Login.");

      // force OTP
      $("dsg-reg-otp-row").style.display = "";
      if (!otp) return setError("Sila isi OTP. (Tekan Send OTP dulu kalau belum)");
      const v = verifyOtp(phone, "register", otp);
      if (!v.ok) return setError(v.msg);

      if (!isValidPin(pin)) return setError("PIN mesti 6 digit nombor.");
      if (pin !== pin2) return setError("Confirm PIN tak sama.");

      setUser(phone, { phone: normalizePhone(phone), pin, createdAt: new Date().toISOString() });
      ensureWallet(phone);

      clearOtp(phone, "register");
      setSession(phone);
      close();
    });

    // ===== FORGOT PIN: Send OTP =====
    $("dsg-btn-forgot-sendotp").addEventListener("click", () => {
      const phone = normalizePhone($("dsg-forgot-phone").value);
      if (!phone) return setError("Sila isi No Phone.");

      const u = getUser(phone);
      if (!u) return setError("Nombor ini belum register. Tak boleh reset PIN.");

      const res = sendOtp(phone, "forgot");
      if (!res.ok) return setError(res.msg);

      $("dsg-forgot-otp-row").style.display = "";
      setError("✅ OTP dihantar. Sila masukkan OTP.");
    });

    // ===== FORGOT PIN: Verify OTP & Reset PIN =====
    $("dsg-btn-forgot-reset").addEventListener("click", () => {
      const phone = normalizePhone($("dsg-forgot-phone").value);
      const otp = String($("dsg-forgot-otp").value || "").trim();
      const pin = String($("dsg-forgot-pin").value || "").trim();
      const pin2 = String($("dsg-forgot-pin2").value || "").trim();

      if (!phone) return setError("Sila isi No Phone.");

      const u = getUser(phone);
      if (!u) return setError("Nombor ini belum register. Tak boleh reset PIN.");

      $("dsg-forgot-otp-row").style.display = "";
      if (!otp) return setError("Sila isi OTP. (Tekan Send OTP dulu kalau belum)");
      const v = verifyOtp(phone, "forgot", otp);
      if (!v.ok) return setError(v.msg);

      if (!isValidPin(pin)) return setError("PIN mesti 6 digit nombor.");
      if (pin !== pin2) return setError("Confirm PIN tak sama.");

      setUser(phone, { ...u, phone: normalizePhone(phone), pin, updatedAt: new Date().toISOString() });
      clearOtp(phone, "forgot");

      // optional: auto login lepas reset
      ensureWallet(phone);
      setSession(phone);
      close();
    });
  }

  function openModal({ forceRegister = false } = {}) {
    injectStyles();
    renderModal();
    const backdrop = document.getElementById("dsg-auth-backdrop");
    backdrop.style.display = "flex";

    if (forceRegister) {
      document.getElementById("dsg-tab-register")?.click();
    } else {
      document.getElementById("dsg-tab-login")?.click();
    }
  }

  function ensureMiniChip() {
    injectStyles();
    if (document.getElementById("dsg-auth-mini")) return;

    const chip = document.createElement("div");
    chip.id = "dsg-auth-mini";
    chip.className = "dsg-auth-mini";
    document.body.appendChild(chip);

    function render() {
      const s = getSession();
      if (!s?.phone) {
        chip.innerHTML = `Not logged in <button type="button" id="dsg-mini-login">Login</button>`;
        chip.querySelector("#dsg-mini-login").addEventListener("click", () => openModal({}));
      } else {
        chip.innerHTML = `Logged: <b>${s.phone}</b> <button type="button" id="dsg-mini-logout">Logout</button>`;
        chip.querySelector("#dsg-mini-logout").addEventListener("click", logout);
      }
    }

    render();
    window.addEventListener("dsg:auth-changed", render);
  }

  function autoPromptOncePerTab() {
    const s = getSession();
    if (s?.phone) return;

    const key = "DSG_AUTH_PROMPTED";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    openModal({});
  }

  // expose API
  window.DSGAuth = {
    getSession,
    openModal,
    logout,

    // penting: dashboard.js panggil normalizePhone (kalau tak ada, boleh crash)
    normalizePhone,

    wallet: {
      ensureWallet,
      getBalance: walletGet,
      setBalance: walletSet,
      addBalance: walletAdd,
      deductBalance: walletDeduct,
    },

    otp: {
      sendOtp,
      verifyOtp,
      isOtpVerified,
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureMiniChip();
    autoPromptOncePerTab();
  });
})();