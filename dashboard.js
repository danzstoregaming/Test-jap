// dashboard.js — Dashboard logic (Firestore-first with local fallback)

// ===== Firebase helpers =====
function fsDb(){
  const fb = window.DSGFirebase;
  return fb && fb.enabled && fb.db ? fb.db : null;
}
function fsTs(){
  const fb = window.DSGFirebase;
  return fb && fb.enabled && typeof fb.serverTimestamp === "function" ? fb.serverTimestamp() : null;
}
function fsEnabled(){ return !!fsDb(); }

// ===== NAV =====
const navBtns = document.querySelectorAll(".nav");
const views = {
  account: document.getElementById("view-account"),
  wallet:  document.getElementById("view-wallet"),
  history: document.getElementById("view-history"),
  mlbb:    document.getElementById("view-mlbb"),
  auth:    document.getElementById("view-auth"),
  help:    document.getElementById("view-help"),
};

function setView(key){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === key));
  Object.entries(views).forEach(([k, el]) => el && el.classList.toggle("active", k === key));

  // bila tukar view, refresh UI yang bergantung pada session
  if (key === "account") renderAccount();
  if (key === "wallet")  syncWalletUI();
  if (key === "history") renderHistory();
  if (key === "auth")    renderAuthView();
}

navBtns.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));


// ===== HELPERS =====
const money = (n)=> `RM ${Number(n||0).toFixed(2)}`;
const nowISO = ()=> new Date().toISOString();
function sessionPhone(){ return window.DSGAuth?.getSession?.()?.phone || ""; }

// ===== LOCAL FALLBACK =====
const ORDERS_KEY = "DSG_ORDERS";
function loadOrdersLocal(){
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); }
  catch(e){ return []; }
}
function saveOrdersLocal(list){
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
}
function getUserLocal(phone){
  const p = window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : String(phone||"").trim();
  const legacy = String(phone || "").trim().replace(/\s+/g, "");
  try {
    const v1 = localStorage.getItem("DSG_USER_" + p);
    if (v1) return JSON.parse(v1);
    const v2 = localStorage.getItem("DSG_USER_" + legacy);
    if (v2) return JSON.parse(v2);
    return null;
  } catch {
    return null;
  }
}

// ===== ACCOUNT (Firestore-first) =====
async function fetchUserFS(phone){
  const db = fsDb();
  if (!db || !phone) return null;
  const p = window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : phone;
  const snap = await db.collection("users").doc(p).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() }) : null;
}

function fmtMaybeTs(v){
  try{
    if (v && typeof v.toDate === "function") return v.toDate().toLocaleString();
    if (typeof v === "string" && v) return new Date(v).toLocaleString();
  }catch{}
  return "-";
}

function accNormalizeCompare(s){
  return String(s ?? "").replace(/\s+/g," ").trim();
}

function getAccEls(){
  return {
    sub: document.getElementById("acc-sub"),
    note: document.getElementById("acc-note"),
    phoneEl: document.getElementById("acc-phone"),
    roleEl: document.getElementById("acc-role"),
    pinEl: document.getElementById("acc-pin"),
    createdEl: document.getElementById("acc-created"),
    updatedEl: document.getElementById("acc-updated"),
    nameEl: document.getElementById("acc-name"),
    emailEl: document.getElementById("acc-email"),
    saveBtn: document.getElementById("btn-acc-save"),
  };
}

function setSaveEnabled(enabled){
  const { saveBtn } = getAccEls();
  if (saveBtn) saveBtn.disabled = !enabled;
}

function setBaseline(name, email){
  const { nameEl, emailEl } = getAccEls();
  if (nameEl) nameEl.dataset.base = accNormalizeCompare(nameEl.value ?? name ?? "");
  if (emailEl) emailEl.dataset.base = accNormalizeCompare(emailEl.value ?? email ?? "");
}

function hasChanges(){
  const { nameEl, emailEl } = getAccEls();
  const b1 = nameEl?.dataset.base ?? "";
  const b2 = emailEl?.dataset.base ?? "";
  const c1 = accNormalizeCompare(nameEl?.value ?? "");
  const c2 = accNormalizeCompare(emailEl?.value ?? "");
  return (c1 !== b1) || (c2 !== b2);
}

function updateSaveState(){
  setSaveEnabled(hasChanges());
}

function renderAccount(){
  const phone = sessionPhone();
  const els = getAccEls();

  if (!phone){
    if (els.sub) els.sub.textContent = "Account Details";
    if (els.note) els.note.textContent = "";
    if (els.phoneEl) els.phoneEl.value = "";
    if (els.roleEl) els.roleEl.value = "-";
    if (els.pinEl) els.pinEl.value = "-";
    if (els.createdEl) els.createdEl.value = "-";
    if (els.updatedEl) els.updatedEl.value = "-";
    if (els.nameEl) els.nameEl.value = "";
    if (els.emailEl) els.emailEl.value = "";
    if (els.nameEl) { delete els.nameEl.dataset.userTouched; delete els.nameEl.dataset.initialized; }
    if (els.emailEl){ delete els.emailEl.dataset.userTouched; delete els.emailEl.dataset.initialized; }
    setBaseline("", "");
    setSaveEnabled(false);
    return;
  }

  if (els.sub) els.sub.textContent = "Account Details";

  if (els.phoneEl) els.phoneEl.value = phone;
  if (els.pinEl) els.pinEl.value = "******";
  if (els.note) els.note.textContent = "";

  // local first (instant)
  const local = getUserLocal(phone) || {};
  if (els.roleEl) els.roleEl.value = (local.role || "-");
  if (els.createdEl) els.createdEl.value = fmtMaybeTs(local.createdAt);
  if (els.updatedEl) els.updatedEl.value = fmtMaybeTs(local.updatedAt);

  // Only set inputs if not initialized (avoid overwriting user typing)
  if (els.nameEl && !els.nameEl.dataset.initialized){
    els.nameEl.value = local.name || "";
    els.nameEl.dataset.initialized = "1";
  }
  if (els.emailEl && !els.emailEl.dataset.initialized){
    els.emailEl.value = local.email || "";
    els.emailEl.dataset.initialized = "1";
  }

  // baseline from whatever is currently shown
  setBaseline(els.nameEl?.value || "", els.emailEl?.value || "");
  updateSaveState();

  // async Firestore (best-effort)
  (async ()=>{
    if (!fsEnabled()) return;
    try{
      const u = await fetchUserFS(phone);
      if (!u) return;

      if (els.createdEl) els.createdEl.value = fmtMaybeTs(u.createdAt);
      if (els.updatedEl) els.updatedEl.value = fmtMaybeTs(u.updatedAt);
      if (els.roleEl) els.roleEl.value = (u.role || local.role || "-");

      // Only populate fields if user hasn't started typing
      if (els.nameEl && !els.nameEl.dataset.userTouched){
        els.nameEl.value = u.name || "";
        els.nameEl.dataset.initialized = "1";
      }
      if (els.emailEl && !els.emailEl.dataset.userTouched){
        els.emailEl.value = u.email || "";
        els.emailEl.dataset.initialized = "1";
      }

      // keep local cache in sync (best-effort)
      try{
        const merged = { ...local, ...u };
        localStorage.setItem("DSG_USER_" + phone, JSON.stringify(merged));
      }catch{}

      // update baseline only if user not typing (so save button stays correct)
      if (!(els.nameEl?.dataset.userTouched || els.emailEl?.dataset.userTouched)){
        setBaseline(els.nameEl?.value || "", els.emailEl?.value || "");
        updateSaveState();
      }
    }catch(e){
      console.warn("[account] Firestore read failed", e);
    }
  })();
}

// track input changes -> enable/disable save button
["acc-name","acc-email"].forEach((id)=>{
  const el = document.getElementById(id);
  if (el){
    el.addEventListener("input", ()=>{
      el.dataset.userTouched = "1";
      updateSaveState();
    });
  }
});

// Pending queue for offline save (Account)
const PENDING_USER_KEY = "DSG_PENDING_USER_UPDATES";
function loadPendingUser(){
  try{ return JSON.parse(localStorage.getItem(PENDING_USER_KEY) || "[]"); }catch{ return []; }
}
function savePendingUser(list){
  try{ localStorage.setItem(PENDING_USER_KEY, JSON.stringify(list || [])); }catch{}
}

async function flushPendingUserToFS(){
  if (!fsEnabled()) return;
  const phone = sessionPhone();
  if (!phone) return;

  const pending = loadPendingUser();
  if (!pending.length) return;

  const db = fsDb();
  const keep = [];

  for (const job of pending){
    try{
      const p = job.phone || phone;
      const payload = job.payload || {};
      await db.collection("users").doc(p).set({
        ...payload,
        phone: p,
        updatedAt: fsTs() || nowISO(),
      }, { merge:true });
    }catch(e){
      console.warn("[account] flush pending failed (keep local)", e);
      keep.push(job);
    }
  }
  savePendingUser(keep);
}

async function saveProfile(){
  const els = getAccEls();
  const phone = sessionPhone();
  if (!phone) return;

  // strict rule: cannot save if no changes
  if (!hasChanges()){
    setSaveEnabled(false);
    if (els.note) els.note.textContent = "Tiada perubahan untuk disimpan.";
    return;
  }

  const payload = {
    name: String(els.nameEl?.value || "").trim(),
    email: String(els.emailEl?.value || "").trim(),
  };

  // local backup immediately
  try{
    const old = getUserLocal(phone) || {};
    const merged = {
      ...old,
      ...payload,
      phone,
      updatedAt: nowISO(),
      createdAt: old.createdAt || nowISO(),
    };
    localStorage.setItem("DSG_USER_" + phone, JSON.stringify(merged));
  }catch{}

  // Firestore primary (do NOT overwrite createdAt)
  if (fsEnabled()){
    try{
      const db = fsDb();
      const ref = db.collection("users").doc(phone);

      // only set createdAt if missing (first time)
      const snap = await ref.get();
      const needCreated = !snap.exists || !(snap.data() || {}).createdAt;

      const data = {
        ...payload,
        phone,
        updatedAt: fsTs() || nowISO(),
      };
      if (needCreated){
        data.createdAt = fsTs() || nowISO();
      }

      await ref.set(data, { merge:true });

      if (els.note) els.note.textContent = "✅ Saved.";
      // baseline updated -> disable button
      setBaseline(payload.name, payload.email);
      setSaveEnabled(false);
      // refresh timestamps
      renderAccount();
      return;
    }catch(e){
      console.warn("[account] Firestore save failed, queue local", e);
    }
  }

  // fallback pending queue
  const pending = loadPendingUser();
  pending.unshift({ phone, payload, queuedAt: nowISO() });
  savePendingUser(pending.slice(0,200));

  if (els.note) els.note.textContent = "⚠️ Firestore gagal — disimpan local (pending sync).";
  setBaseline(payload.name, payload.email);
  setSaveEnabled(false);
}

const btnAccSave = document.getElementById("btn-acc-save");
if (btnAccSave) btnAccSave.addEventListener("click", ()=> saveProfile());


// ===== WALLET (Firestore-first, fallback local) =====
async function fetchWalletFS(phone){
  const db = fsDb();
  if (!db || !phone) return null;
  const p = window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : phone;
  const snap = await db.collection("wallets").doc(p).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() }) : null;
}

const wPhoneEl = document.getElementById("w-phone");
const btnWalletGet = document.getElementById("btn-wallet-get");

async function renderWalletForSession(){
  const note = document.getElementById("wallet-note");
  const out  = document.getElementById("wallet-result");

  const phone = sessionPhone();
  if(!phone){
    if(note) note.textContent = "❌ Not logged in. Tekan Login dulu.";
    if(out) out.textContent = "RM 0.00";
    return;
  }

  // Firestore first
  if (fsEnabled()){
    try{
      const w = await fetchWalletFS(phone);
      if (w && typeof w.balance !== "undefined"){
        const bal = Number(w.balance || 0);
        if(note) note.textContent = `Phone: ${phone} (Firestore)`;
        if(out) out.textContent = money(bal);

        // keep local in sync (so auth.js sync wallet still ok)
        try{
          window.DSGAuth?.wallet?.setBalance?.(phone, bal);
        }catch{}
        return;
      }
    }catch(e){
      console.warn("[wallet] Firestore read failed, fallback local", e);
    }
  }

  // fallback local (auth.js wallet API)
  const api = window.DSGAuth?.wallet;
  if(!api){
    if(note) note.textContent = "❌ auth.js tak load / ada error. Sila refresh.";
    if(out) out.textContent = "RM 0.00";
    return;
  }
  const bal = api.getBalance(phone);
  if(note) note.textContent = `Phone: ${phone} (local)`;
  if(out) out.textContent = money(bal);
}

function syncWalletUI(){
  const phone = sessionPhone();
  if(wPhoneEl){
    wPhoneEl.readOnly = true;
    if(phone){
      wPhoneEl.value = phone;
      wPhoneEl.placeholder = "";
    }else{
      wPhoneEl.value = "";
      wPhoneEl.placeholder = "Sila login dulu...";
    }
  }
  if(btnWalletGet){
    btnWalletGet.disabled = !phone;
  }
  renderWalletForSession();
}

if(btnWalletGet){
  btnWalletGet.addEventListener("click", ()=> renderWalletForSession());
}

window.addEventListener("dsg:wallet-changed", (e)=>{
  const phone = sessionPhone();
  if(!phone) return;
  if(e?.detail?.phone === phone){
    renderWalletForSession();
  }
});


// ===== TRANSACTION HISTORY (Firestore-first) =====
function renderHistoryTable(list){
  const body = document.getElementById("history-body");
  const empty = document.getElementById("history-empty");
  if (!body || !empty) return;

  body.innerHTML = "";
  empty.style.display = list.length ? "none" : "block";

  for(const o of list){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(o.ts || nowISO()).toLocaleString()}</td>
      <td>${o.product || "-"}</td>
      <td>${money(o.total)}</td>
      <td>${o.status || "-"}</td>
    `;
    body.appendChild(tr);
  }
}

async function fetchOrdersFS(phone){
  const db = fsDb();
  if (!db || !phone) return null;

  const p = window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : phone;
  const snap = await db.collection("orders")
    .where("phone", "==", p)
    .orderBy("ts", "desc")
    .limit(100)
    .get();

  return snap.docs.map(d => {
    const data = d.data() || {};
    // if ts is Firestore Timestamp
    const ts = data.ts && typeof data.ts.toDate === "function" ? data.ts.toDate().toISOString() : data.ts;
    return { id: d.id, ...data, ts };
  });
}

function renderHistory(){
  const phone = sessionPhone();

  // if not logged in, show local (or empty)
  if (!phone){
    renderHistoryTable([]);
    return;
  }

  // Firestore first
  (async ()=>{
    if (fsEnabled()){
      try{
        const list = await fetchOrdersFS(phone);
        if (Array.isArray(list)){
          renderHistoryTable(list);
          return;
        }
      }catch(e){
        console.warn("[orders] Firestore read failed, fallback local", e);
      }
    }

    // fallback local
    const orders = loadOrdersLocal();
    const list = [...orders].slice().reverse();
    renderHistoryTable(list);
  })();
}

async function seedOrders(){
  const phone = sessionPhone();
  const demo = [
    { ts: nowISO(), product:"Mobile Legends", total: 12.00, status:"pending" },
    { ts: nowISO(), product:"Starlight Card", total: 24.00, status:"completed" },
    { ts: nowISO(), product:"Cinemas", total: 8.00, status:"completed" },
  ];

  if (fsEnabled() && phone){
    const db = fsDb();
    const p = window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : phone;
    try{
      for (const d of demo){
        await db.collection("orders").add({
          phone: p,
          product: d.product,
          total: Number(d.total || 0),
          status: d.status,
          ts: d.ts, // store as ISO string (simple). Later boleh upgrade ke Timestamp.
          createdAt: fsTs() || nowISO(),
        });
      }
      renderHistory();
      return;
    }catch(e){
      console.warn("[orders] seed Firestore failed, fallback local", e);
    }
  }

  // fallback local
  saveOrdersLocal(demo);
  renderHistory();
}

const btnSeed = document.getElementById("btn-seed");
if (btnSeed){
  btnSeed.addEventListener("click", ()=> seedOrders());
}


// ===== AUTH VIEW (Register/Log-In section) =====
const btnOpenLogin = document.getElementById("btn-open-login");
const btnOpenRegister = document.getElementById("btn-open-register");
const btnDoLogout = document.getElementById("btn-do-logout");

function renderAuthView(){
  const sub = document.getElementById("auth-sub");
  const phone = sessionPhone();

  if(sub){
    sub.textContent = phone ? `Logged in: ${phone}` : "Not logged in.";
  }
  if(btnDoLogout) btnDoLogout.disabled = !phone;
}

if(btnOpenLogin){
  btnOpenLogin.addEventListener("click", ()=> window.DSGAuth?.openModal?.({}));
}
if(btnOpenRegister){
  btnOpenRegister.addEventListener("click", ()=> window.DSGAuth?.openModal?.({ forceRegister:true }));
}
if(btnDoLogout){
  btnDoLogout.addEventListener("click", ()=> window.DSGAuth?.logout?.());
}


// ===== MLBB CALC placeholder =====
const btnMlbb = document.getElementById("mlbb-calc");
if (btnMlbb){
  btnMlbb.addEventListener("click", ()=>{
    const mode = document.getElementById("mlbb-mode").value;
    document.getElementById("mlbb-result").textContent = `Mode: ${mode} (placeholder)`;
  });
}


// ===== GLOBAL REACTIVITY =====
window.addEventListener("dsg:auth-changed", async ()=>{
  syncWalletUI();
  renderAccount();
  renderAuthView();
  renderHistory();
  try{ await flushPendingUserToFS(); }catch{}
});


// ===== INIT =====
renderAccount();
syncWalletUI();
renderHistory();
renderAuthView();
