// ===== NAV =====
const navBtns = document.querySelectorAll(".nav");
const views   = {
  overview: document.getElementById("view-overview"),
  mlbb:     document.getElementById("view-mlbb"),
  region:   document.getElementById("view-region"),
  wallet:   document.getElementById("view-wallet"),
};

function setView(key){
  navBtns.forEach(b=>b.classList.toggle("active", b.dataset.view===key));
  Object.entries(views).forEach(([k,el])=> el.classList.toggle("active", k===key));
}

navBtns.forEach(b=> b.addEventListener("click", ()=> setView(b.dataset.view)));

// ===== STORAGE KEYS (boleh tukar ikut Danz) =====
const ORDERS_KEY = "DSG_ORDERS";

// ===== HELPERS =====
const money = (n)=> `RM ${Number(n||0).toFixed(2)}`;
const nowISO = ()=> new Date().toISOString();

function loadOrders(){
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); }
  catch(e){ return []; }
}
function saveOrders(list){
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
}

// ===== OVERVIEW RENDER =====
function renderOverview(){
  const orders = loadOrders();

  const totalOrders = orders.length;
  const revenue = orders.reduce((s,o)=> s + Number(o.total||0), 0);
  const pending = orders.filter(o=>o.status==="pending").length;
  const completed = orders.filter(o=>o.status==="completed").length;

  document.getElementById("ov-orders").textContent = totalOrders;
  document.getElementById("ov-revenue").textContent = money(revenue);
  document.getElementById("ov-pending").textContent = pending;
  document.getElementById("ov-completed").textContent = completed;

  const body = document.getElementById("recent-body");
  const empty = document.getElementById("recent-empty");
  body.innerHTML = "";

  const recent = [...orders].slice(-5).reverse();
  empty.style.display = recent.length ? "none" : "block";

  for(const o of recent){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(o.ts||nowISO()).toLocaleString()}</td>
      <td>${o.product||"-"}</td>
      <td>${money(o.total)}</td>
      <td>${o.status||"-"}</td>
    `;
    body.appendChild(tr);
  }
}

document.getElementById("btn-seed").addEventListener("click", ()=>{
  const demo = [
    { ts: nowISO(), product:"Mobile Legends", total: 12.00, status:"pending" },
    { ts: nowISO(), product:"Starlight Card", total: 24.00, status:"completed" },
    { ts: nowISO(), product:"Cinemas", total: 8.00, status:"completed" },
  ];
  saveOrders(demo);
  renderOverview();
});

// ===== REGION CHECK (format validate sahaja) =====
function isDigitsLen(s, min, max){
  const v = String(s||"").trim();
  return /^\d+$/.test(v) && v.length>=min && v.length<=max;
}

document.getElementById("btn-check").addEventListener("click", ()=>{
  const id = document.getElementById("ml-id").value;
  const server = document.getElementById("ml-server").value;
  const out = document.getElementById("region-result");

  if(!isDigitsLen(id, 5, 15)){
    out.textContent = "❌ User ID tak valid (digits sahaja, 5-15).";
    return;
  }
  if(!isDigitsLen(server, 3, 6)){
    out.textContent = "❌ Server ID tak valid (digits sahaja, 3-6).";
    return;
  }
  out.textContent = `✅ Format OK — ID: ${id} | Server: ${server} (Region checker API nanti boleh upgrade)`;
});

// ===== AUTH BUTTON (top right) =====
const btnLogin = document.getElementById("btn-login");
function syncTopAuthBtn(){
  const s = window.DSGAuth?.getSession?.();
  if(!btnLogin) return;
  if(s?.phone){
    btnLogin.textContent = "Logout";
    btnLogin.onclick = ()=> window.DSGAuth?.logout?.();
  }else{
    btnLogin.textContent = "Login (Phone)";
    btnLogin.onclick = ()=> window.DSGAuth?.openModal?.({});
  }
}
window.addEventListener("dsg:auth-changed", syncTopAuthBtn);
document.addEventListener("DOMContentLoaded", syncTopAuthBtn);

// ===== WALLET (USER: ikut session phone sahaja) =====
function apiWallet(){
  const api = window.DSGAuth?.wallet;
  return api && api.getBalance && api.setBalance ? api : null;
}

const wPhoneEl = document.getElementById("w-phone");
const btnWalletGet = document.getElementById("btn-wallet-get");

function sessionPhone(){
  return window.DSGAuth?.getSession?.()?.phone || "";
}

function renderWalletForSession(){
  const note = document.getElementById("wallet-note");
  const out  = document.getElementById("wallet-result");
  const api = apiWallet();

  if(!api){
    if(note) note.textContent = "❌ auth.js tak load / ada error. Sila refresh / clear cache.";
    if(out) out.textContent = "RM 0.00";
    return;
  }

  const phone = sessionPhone();
  if(!phone){
    if(note) note.textContent = "❌ Not logged in. Tekan Login (Phone) dulu.";
    if(out) out.textContent = "RM 0.00";
    return;
  }

  const bal = api.getBalance(phone);
  if(note) note.textContent = `Phone: ${phone}`;
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
  btnWalletGet.addEventListener("click", renderWalletForSession);
}

window.addEventListener("dsg:auth-changed", syncWalletUI);
window.addEventListener("dsg:wallet-changed", (e)=>{
  const phone = sessionPhone();
  if(!phone) return;
  if(e?.detail?.phone === phone){
    renderWalletForSession();
  }
});


// ===== MLBB CALC placeholder =====
document.getElementById("mlbb-calc").addEventListener("click", ()=>{
  const mode = document.getElementById("mlbb-mode").value;
  document.getElementById("mlbb-result").textContent = `Mode: ${mode} (placeholder)`;
});

// init
renderOverview();