// ===== DSG WALLET CONFIG =====
const WALLET_NAME = "Wallet"; // nanti tukar jadi "Vault"
const CURRENCY = "MYR";       // nanti tukar jadi "DM"

// Single source of truth (prefer auth.js API if loaded)
function _walletApi(){
  return window.DSGAuth?.wallet && window.DSGAuth.wallet.getBalance ? window.DSGAuth.wallet : null;
}
function walletKey(phone){
  // fallback key (must match auth.js)
  const p = (window.DSGAuth?.normalizePhone ? window.DSGAuth.normalizePhone(phone) : String(phone||"").replace(/\D/g,""));
  return `DSG_WALLET_${p}`;
}
function getWallet(phone){
  const api = _walletApi();
  if(api) return Number(api.getBalance(phone) || 0);
  const v = Number(localStorage.getItem(walletKey(phone)) || 0);
  return Number.isFinite(v) ? v : 0;
}
function setWallet(phone, amount){
  const api = _walletApi();
  if(api) return api.setBalance(phone, amount);
  localStorage.setItem(walletKey(phone), Number(amount || 0).toFixed(2));
}
function formatMoney(n){
  return `${CURRENCY} ${Number(n||0).toFixed(2)}`;
}

// Update the Wallet label in Payment Method card (small text)
function updateWalletMini(){
  const el = document.getElementById("wallet-mini");
  if(!el) return;

  // prefer logged-in phone (auth.js session)
  let phone = window.DSGAuth?.getSession?.()?.phone || null;
  if(!phone){
    try{
      const s = JSON.parse(localStorage.getItem("DSG_AUTH") || "null");
      phone = s?.phone || null;
    }catch(e){ phone = null; }
  }

  if(!phone){
    el.textContent = `(${CURRENCY} 0.00)`;
    return;
  }

  const bal = getWallet(phone);
  el.textContent = `(${formatMoney(bal)})`;
}

// keep wallet mini synced
document.addEventListener("DOMContentLoaded", ()=>{
  updateWalletMini();
  window.addEventListener("dsg:auth-changed", updateWalletMini);
  window.addEventListener("dsg:wallet-changed", updateWalletMini);
});

// ===== PHONE NORMALIZER (BY COUNTRY) =====
function getSelectedCountry(){
  const el = document.getElementById("wa-country");
  if (!el) return "MY";
  // support both <select> and hidden input (custom dropdown)
  return (el.value || el.getAttribute("value") || "MY");
}

// return "local format" untuk SIMPAN dalam sistem (localStorage)
// MY: 011xxxxxxxx
// ID: 08xxxxxxxxxx
// BN: 7xxxxxx (tanpa 0)
function normalizeLocalPhone(raw, country){
  let p = String(raw || "").replace(/\D/g, ""); // digits only
  if(!p) return "";

  // buang prefix + atau 00 style (kalau user paste)
  if (p.startsWith("00")) p = p.slice(2);

  if(country === "MY"){
    // buang 60 jika user masuk international
    if(p.startsWith("60")) p = p.slice(2);
    // pastikan start dengan 0
    if(!p.startsWith("0")) p = "0" + p;
    return p;
  }

  if(country === "ID"){
    if(p.startsWith("62")) p = p.slice(2);
    if(!p.startsWith("0")) p = "0" + p;
    // standard ID selalunya 08...
    return p;
  }

  if(country === "BN"){
    if(p.startsWith("673")) p = p.slice(3);
    // BN local tak pakai 0
    if(p.startsWith("0")) p = p.slice(1);
    return p;
  }

  // fallback: simpan macam digit sahaja
  return p;
}

// untuk WHATSAPP LINK (wa.me mesti international, tanpa +, tanpa 0 depan)
function toWhatsAppInternational(localPhone, country){
  let p = String(localPhone || "").replace(/\D/g, "");
  if(!p) return "";

  if(country === "MY"){
    if(p.startsWith("0")) p = p.slice(1);
    return "60" + p;
  }
  if(country === "ID"){
    if(p.startsWith("0")) p = p.slice(1);
    return "62" + p;
  }
  if(country === "BN"){
    if(p.startsWith("0")) p = p.slice(1);
    return "673" + p;
  }
  return p;
}

// ===== ADMIN COMMAND (Console Only) =====
window.addBalance = function(phone, amount){
  if(!phone || !amount){
    console.warn("Usage: addBalance('60123456789', 20)");
    return;
  }

  const current = getWallet(phone);
  const newBal = current + Number(amount);

  setWallet(phone, newBal);

  console.log(
    `✅ Balance updated:
Phone: ${phone}
Old: ${formatMoney(current)}
Added: ${formatMoney(amount)}
New: ${formatMoney(newBal)}`
  );
};

document.addEventListener("DOMContentLoaded", () => { // ===== Voucher text (SAFE) =====
let voucherText = "Tiada";
if (window.appliedVoucher) {
  voucherText = window.appliedVoucher.text;
}
  // ===== Helpers =====
  const qs  = (s)=> document.querySelector(s);
  const qsa = (s)=> document.querySelectorAll(s);
  const el  = (tag, attrs={}, text)=>{
    const n=document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
    if(text) n.textContent=text;
    return n;
  };

  // ===== HASH PATH: #/Title/SubTitle/Via (optional query ?img=&type=)
  function parseHashPath(){
    const m = location.hash.match(/^#\/([^/?]+)\/([^/?]+)\/([^/?]+)/i);
    if(!m) return null;
    return {
      title: decodeURIComponent(m[1]),
      subtitle: decodeURIComponent(m[2]),
      via: decodeURIComponent(m[3])
    };
  }

  // ===== Baca query (sokong sebelum/selepas hash)
  function readQueryParams(){
    const p1 = new URLSearchParams(location.search); // ?...
    let p2 = new URLSearchParams();
    const qi = location.hash.indexOf("?");
    if (qi !== -1) p2 = new URLSearchParams(location.hash.slice(qi + 1));
    const all = new URLSearchParams(p2);
    for (const [k,v] of p1.entries()) all.set(k,v);
    return all;
  }

  const path = parseHashPath();
  const params = readQueryParams();

  // ===== Data Produk =====
  const nama   = (path?.title)    || params.get("item")   || "Unknown Product";
  const region = (path?.subtitle) || params.get("region") || "All Server";
  const via    = (path?.via)      || params.get("via")    || "Log-In";
  const img    = params.get("img")  || "https://picsum.photos/seed/dsg/300";
  const type   = params.get("type") || "normal";
  const exqty  = params.get("exqty");
  const exname = params.get("exname");
  const exprice= parseFloat(params.get("exprice"));

  // ===== SENARAI ITEM / PRODUCT PRESET =====
  const PRODUCT_ITEMS = {
    // =========================
    //  LIMITED EDITION
    // =========================
    "Soul Vessel 2.0 | 7 - 10 Hari | Gift": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "7 Hari Pertama", name: "7 - 10 Hari", price: 215.00 , img: ""},
            { qty: "Phase 1", name: "7 - 10 Hari", price: 210.00 , img: ""},
            { qty: "Phase 2", name: "7 - 10 Hari", price: 190.00 , img: ""},
            { qty: "10 Hari Terakhir", name: "7 - 10 Hari", price: 170.00 , img: ""}
          ]
        }
      ]
    },
    
    "Joki Collector | 1 - 48 Jam | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "New Skin Collector", name: "Instant", price: 185.00 , img: ""},
            { qty: "Resale Skin Collector", name: "Instant", price: 190.00 , img: ""}
          ]
        }
      ]
    },
    
    "Joki Annual Starlight | 1 - 48 Jam | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "Joki Sun Annual", name: "Instant", price: 135.00 , img: ""},
            { qty: "Joki Sun Annual", name: "Phase 1 + Ticket", price: 115.00 , img: ""},
            //{ qty: "Phase 2", name: "7 - 10 Hari", price: 190.00 , img: ""}
          ]
        }
      ]
    },
    
    "M7 Pass | 7 - 10 Hari | Gift": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "M7 Pass", name: "7 - 10 Hari", price: 25.00 , img: ""}
          ]
        }
      ]
    },
    
    "Joki Recall Spongebob | 1 - 48 Jam | Log-In": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "Recall Spongebob", name: "Instant", price: 115.00 , img: ""}
          ]
        }
      ]
    },
    
    "Joki Prime Instant | 1 - 48 Jam | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "Skin Prime", name: "Instant", price: 600.00 , img: ""}
          ]
        }
      ]
    },
    
    "Via Redeem Code | 1 - 60 Minit | Nick ID Server": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Edition",
          items: [
            { qty: "Layla Blue Spectre", name: "Redeem Code", price: 10100.00 , img: "https://i.imghippo.com/files/eNl6190tUk.jpg"},
            { qty: "Selena Zenith", name: "Redeem Code", price: 260.00 , img: "https://i.imghippo.com/files/gtL1139qLc.jpg"},
            { qty: "Benedetta Covenant", name: "Redeem Code",  price: 60.00 , img: "https://i.imghippo.com/files/qbQq1925ZoY.jpg"}
          ]
        }
      ]
    },

    // =========================
    //  MOBILE LEGENDS (TOP-UP)
    // =========================
    "Mobile Legends | Malaysia | Nick ID Server": {
      infoImg: "",
      groups: [
                {
          title: "First Time Recharge",
          items: [
            { qty: "100", name: "50 + 50", price: 4.00 , img: "https://i.imghippo.com/files/LZD3548mc.png"},
            { qty: "300", name: "150 + 150", price: 12.00 , img: "https://i.imghippo.com/files/LZD3548mc.png"},
            { qty: "500", name: "250 + 250", price: 19.50 , img: "https://i.imghippo.com/files/LZD3548mc.png"},
            { qty: "1000", name: "500 + 500", price: 39.50 , img: "https://i.imghippo.com/files/LZD3548mc.png"}
          ]
        },
{
  title: "Diamond",
  items: [
    { qty: "14", name: "Diamond", price: 1.03, img: "https://i.imghippo.com/files/mnc2104LA.webp" },
    { qty: "28", name: "Diamond", price: 2.05, img: "https://i.imghippo.com/files/LWH6456a.webp" },
    { qty: "42", name: "Diamond", price: 3.05, img: "https://i.imghippo.com/files/LWH6456a.webp" },
    { qty: "55", name: "Diamond", price: 3.95, img: "https://i.imghippo.com/files/zj1576MZg.webp" },
    { qty: "56", name: "Diamond", price: 4.05, img: "https://i.imghippo.com/files/zj1576MZg.webp" },
    { qty: "70", name: "Diamond", price: 4.99, img: "https://i.imghippo.com/files/zj1576MZg.webp" },
    { qty: "84", name: "Diamond", price: 5.99, img: "https://i.imghippo.com/files/zj1576MZg.webp" },

    { qty: "140", name: "Diamond", price: 9.99, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "165", name: "Diamond", price: 11.65, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "182", name: "Diamond", price: 12.98, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "210", name: "Diamond", price: 14.93, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },

    { qty: "275", name: "Diamond", price: 19.34, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "284", name: "Diamond", price: 19.91, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "326", name: "Diamond", price: 22.89, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "355", name: "Diamond", price: 24.88, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "397", name: "Diamond", price: 27.87, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "429", name: "Diamond", price: 29.83, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "443", name: "Diamond", price: 30.82, img: "https://i.imghippo.com/files/VOLM3171u.webp" },

    { qty: "513", name: "Diamond", price: 35.77, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "565", name: "Diamond", price: 39.25, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "569", name: "Diamond", price: 39.72, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "583", name: "Diamond", price: 40.72, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "639", name: "Diamond", price: 44.66, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "716", name: "Diamond", price: 49.64, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "772", name: "Diamond", price: 53.62, img: "https://i.imghippo.com/files/Bks9821zE.webp" },

    { qty: "870", name: "Diamond", price: 60.53, img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1070", name: "Diamond", price: 76.00, img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1145", name: "Diamond", price: 79.38, img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1159", name: "Diamond", price: 80.38, img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1285", name: "Diamond", price: 89.27, img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },

    { qty: "1446", name: "Diamond", price: 98.93, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1460", name: "Diamond", price: 99.92, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1530", name: "Diamond", price: 104.86, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1586", name: "Diamond", price: 108.81, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1656", name: "Diamond", price: 113.76, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1730", name: "Diamond", price: 121.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1772", name: "Diamond", price: 124.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },

    { qty: "1870", name: "Diamond", price: 131.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "2162", name: "Diamond", price: 148.46, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "2302", name: "Diamond", price: 158.36, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "2446", name: "Diamond", price: 172.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "2591", name: "Diamond", price: 182.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "2976", name: "Diamond", price: 198.31, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3004", name: "Diamond", price: 205.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3032", name: "Diamond", price: 202.26, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "3260", name: "Diamond", price: 223.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3302", name: "Diamond", price: 226.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3330", name: "Diamond", price: 228.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "3545", name: "Diamond", price: 243.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3689", name: "Diamond", price: 253.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3692", name: "Diamond", price: 247.87, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3832", name: "Diamond", price: 263.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "3976", name: "Diamond", price: 267.67, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4121", name: "Diamond", price: 277.59, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4422", name: "Diamond", price: 305.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "4562", name: "Diamond", price: 307.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4706", name: "Diamond", price: 316.95, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4851", name: "Diamond", price: 326.85, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "5138", name: "Diamond", price: 346.68, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "5868", name: "Diamond", price: 405.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "7502", name: "Diamond", price: 494.66, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "7786", name: "Diamond", price: 514.47, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "7931", name: "Diamond", price: 524.39, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "8071", name: "Diamond", price: 545.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8218", name: "Diamond", price: 544.21, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8358", name: "Diamond", price: 565.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8502", name: "Diamond", price: 575.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8647", name: "Diamond", price: 585.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "8948", name: "Diamond", price: 593.48, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "9088", name: "Diamond", price: 615.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "9232", name: "Diamond", price: 625.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "9377", name: "Diamond", price: 623.22, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "9664", name: "Diamond", price: 643.04, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "10394", name: "Diamond", price: 710.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "10478", name: "Diamond", price: 692.87, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "10618", name: "Diamond", price: 720.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "10762", name: "Diamond", price: 730.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "10907", name: "Diamond", price: 722.61, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "11194", name: "Diamond", price: 760.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "11924", name: "Diamond", price: 791.70, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "13454", name: "Diamond", price: 891.06, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "15004", name: "Diamond", price: 1010.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "15144", name: "Diamond", price: 1020.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "15288", name: "Diamond", price: 1030.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "15433", name: "Diamond", price: 1040.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "15720", name: "Diamond", price: 1060.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "16450", name: "Diamond", price: 1088.05, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "17980", name: "Diamond", price: 1187.44, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "22506", name: "Diamond", price: 1500.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "30078", name: "Diamond", price: 2080.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "37650", name: "Diamond", price: 2580.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "45296", name: "Diamond", price: 3085.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "52869", name: "Diamond", price: 3585.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "60445", name: "Diamond", price: 4085.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" }
  ]
},
{
  title: "Game Pass",
  items: [
    {
      qty: "WDP x1",
      name: "Weekly Diamond Pass",
      price: 8.50,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x2",
      name: "Weekly Diamond Pass",
      price: 17.00,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x3",
      name: "Weekly Diamond Pass",
      price: 25.50,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x4",
      name: "Weekly Diamond Pass",
      price: 34.00,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x5",
      name: "Weekly Diamond Pass",
      price: 42.50,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x10",
      name: "Weekly Diamond Pass",
      price: 85.00,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "Twilight Pass",
      name: "1 Time Purchase",
      price: 40.00,
      img: "https://i.imghippo.com/files/kRwB8798Htg.png"
    }
  ]
}
]
    },

    "Mobile Legends | Indonesia | Nick ID Server": {
  infoImg: "",
  groups: [
    {
      title: "First Time Recharge",
      items: [
        { qty: "100",  name: "50 + 50",  price: 4.00 , img: "https://i.imghippo.com/files/LZD3548mc.png"},
        { qty: "300",  name: "150 + 150",price: 12.00, img: "https://i.imghippo.com/files/LZD3548mc.png"},
        { qty: "500",  name: "250 + 250",price: 21.00, img: "https://i.imghippo.com/files/LZD3548mc.png"},
        { qty: "1000", name: "500 + 500",price: 42.00, img: "https://i.imghippo.com/files/LZD3548mc.png"}
      ]
    },
{
  title: "Diamond",
  items: [
    { qty: "5",    name: "Diamond", price: 0.42, img: "https://i.imghippo.com/files/mnc2104LA.webp" },
    { qty: "12",   name: "Diamond", price: 0.95, img: "https://i.imghippo.com/files/mnc2104LA.webp" },

    { qty: "19",   name: "Diamond", price: 1.45, img: "https://i.imghippo.com/files/LWH6456a.webp" },
    { qty: "28",   name: "Diamond", price: 2.10, img: "https://i.imghippo.com/files/LWH6456a.webp" },
    { qty: "44",   name: "Diamond", price: 3.15, img: "https://i.imghippo.com/files/LWH6456a.webp" },

    { qty: "59",   name: "Diamond", price: 4.20, img: "https://i.imghippo.com/files/zj1576MZg.webp" },
    { qty: "85",   name: "Diamond", price: 6.05, img: "https://i.imghippo.com/files/zj1576MZg.webp" },

    { qty: "170",  name: "Diamond", price: 12.10, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "240",  name: "Diamond", price: 17.00, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "296",  name: "Diamond", price: 21.00, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },

    { qty: "408",  name: "Diamond", price: 28.90, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "568",  name: "Diamond", price: 39.50, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "875",  name: "Diamond", price: 60.50, img: "https://i.imghippo.com/files/VOLM3171u.webp" },

    { qty: "2010", name: "Diamond", price: 131.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "4830", name: "Diamond", price: 316.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" }
  ]
},
{
  title: "Game Pass",
  items: [
    {
      qty: "WDP x1",
      name: "Weekly Diamond Pass",
      price: 7.90,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x2",
      name: "Weekly Diamond Pass",
      price: 15.50,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x3",
      name: "Weekly Diamond Pass",
      price: 23.50,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x4",
      name: "Weekly Diamond Pass",
      price: 31.00,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x5",
      name: "Weekly Diamond Pass",
      price: 38.90,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "WDP x10",
      name: "Weekly Diamond Pass",
      price: 78.00,
      img: "https://i.imghippo.com/files/SmaO1269xFc.png"
    },
    {
      qty: "Twilight Pass",
      name: "1 Time Purchase",
      price: 40.00,
      img: "https://i.imghippo.com/files/kRwB8798Htg.png"
    }
  ]
}
      ]
    },

    "Mobile Legends | 0 - 48 Jam | Log-In": {
      infoImg: "",
      groups: [
        {
          title: "Diamond",
          items: [
    { qty: "275",   name: "Diamond", price: 22.00,  img: "https://i.imghippo.com/files/zj1576MZg.webp" },
    { qty: "440",   name: "Diamond", price: 33.00,  img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "565",   name: "Diamond", price: 39.00,  img: "https://i.imghippo.com/files/VOLM3171u.webp" },

    { qty: "840",   name: "Diamond", price: 56.00,  img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1005",  name: "Diamond", price: 68.00,  img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },
    { qty: "1155",  name: "Diamond", price: 73.00,  img: "https://i.imghippo.com/files/lNqs3174Ev.webp" },

    { qty: "1430",  name: "Diamond", price: 90.00,  img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "1765",  name: "Diamond", price: 110.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "2040",  name: "Diamond", price: 128.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },

    { qty: "2495",  name: "Diamond", price: 156.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "2975",  name: "Diamond", price: 174.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "3530",  name: "Diamond", price: 212.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4130",  name: "Diamond", price: 246.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "4740",  name: "Diamond", price: 282.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "5015",  name: "Diamond", price: 300.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "6000",  name: "Diamond", price: 348.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "7210",  name: "Diamond", price: 420.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8040",  name: "Diamond", price: 476.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "8975",  name: "Diamond", price: 525.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },

    { qty: "12000", name: "Diamond", price: 698.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "18000", name: "Diamond", price: 1035.00,img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "24000", name: "Diamond", price: 1380.00,img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "36000", name: "Diamond", price: 2070.00,img: "https://i.imghippo.com/files/ezYj6871lcw.webp" }
  ]
}
      ]
    },

    "Diamond MLBB Promo | For Malaysia Only | Nick ID Server": {
      infoImg: "",
      groups: [
{
  title: "Malaysia Only",
  items: [
    { qty: "172",  name: "Diamond", price: 12.50, img: "https://i.imghippo.com/files/uHWt6582pYo.webp" },
    { qty: "257",  name: "Diamond", price: 18.50, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "344",  name: "Diamond", price: 25.00, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "516",  name: "Diamond", price: 37.00, img: "https://i.imghippo.com/files/VOLM3171u.webp" },
    { qty: "706",  name: "Diamond", price: 49.00, img: "https://i.imghippo.com/files/VOLM3171u.webp" },

    { qty: "1346", name: "Diamond", price: 91.00, img: "https://i.imghippo.com/files/Bks9821zE.webp" },
    { qty: "1825", name: "Diamond", price: 121.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },
    { qty: "2195", name: "Diamond", price: 146.00, img: "https://i.imghippo.com/files/UEP3237Wag.webp" },

    { qty: "3688", name: "Diamond", price: 242.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "5532", name: "Diamond", price: 363.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" },
    { qty: "9288", name: "Diamond", price: 604.00, img: "https://i.imghippo.com/files/ezYj6871lcw.webp" }
  ]
}
      ]
    },

    "Event Ticket Recharge | Malaysia/Indonesia | Nick ID Server": {
      infoImg: "",
      groups: [
        {
          title: "Malaysia",
          items: [
            { qty: "53",  name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "375", name: "50 + 3", price: 25.00 , img: ""}
          ]
        },
        {
          title: "Indonesia",
          items: [
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "182", name: "50 + 3", price: 13.79 , img: ""},
            { qty: "375", name: "50 + 3", price: 25.00 , img: ""}
          ]
        }
      ]
    },

    "Starlight Card | 7 - 10 Hari | Gift": {
      infoImg: "",
      groups: [
        {
          title: "Starlight Card",
          items: [
            { qty: "Starlight Basic", name: "7 - 10 Hari", price: 11.50 , img: "https://i.postimg.cc/sx5X2hDV/5ac5426b_d5dc_4e1c_b619_7255c9b0a3d0_removalai_preview.png"},
            { qty: "Starlight Plus", name: "7 - 10 Hari", price: 24.00 , img: "https://i.postimg.cc/Gtv2pyhb/350884d8_025d_4391_9ac7_bec91c655fcc_removalai_preview.png"}
          ]
        }
      ]
    },

    // =========================
    //  JOKI RANK / ROOM / SHOP
    // =========================
    // Per Star = paparan senarai harga saja (kad disabled + Rank Booster)
    "Joki Ranked | Per Star | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Display Harga",
          items: [
            { qty: "Warrior", name: "Display", price: 0.50 , img: "https://i.postimg.cc/1XY4tyy6/b5ba396c-de51-4ccb-a1d8-e90d406f8add-removalai-preview.png"},
            { qty: "Elite", name: "Display", price: 0.80 , img: "https://i.postimg.cc/rmVpNDpv/d74e5762_f875_4205_ba00_5e3a424a4402_removalai_preview.png"},
            { qty: "Master", name: "Display", price: 1.00 , img: "https://i.postimg.cc/TwdPJKPF/5c4985cd_3f40_4591_bdb6_71812c42f7bd_removalai_preview.png"},
            { qty: "Grand Master", name: "Display", price: 1.50 , img: "https://i.postimg.cc/9MmfYDfS/b830d990_a59b_4a64_8b0b_89db4a4814a5_removalai_preview.png"},
            { qty: "Epic", name: "Display", price: 2.00 , img: "https://i.postimg.cc/3wKhPPHv/cf82e6ba_e34d_4642_9b44_278785531d40_removalai_preview.png"},
            { qty: "Legend", name: "Display", price: 3.00 , img: "https://i.postimg.cc/fbws66h0/f1ba3181_7a70_42c4_bf41_14177229081e_removalai_preview.png"},
            { qty: "Mythic", name: "Display", price: 5.00 , img: "https://i.postimg.cc/SxLq1mHr/c57c83b3_2df1_469f_9475_8df1af53d7a6_removalai_preview.png"},
            { qty: "Mythic Honor", name: "Display", price: 6.00 , img: "https://i.postimg.cc/Z5PZsJXx/06055716_a8a8_47fd_9912_9c1e96ceb2f8_removalai_preview.png"},
            { qty: "Mythic Glory", name: "Display", price: 7.00 , img: "https://i.postimg.cc/N0gtWWwX/647ff459_b6cf_4c40_a4e4_583da3c2d5d8_removalai_preview.png"},
            { qty: "Mythic Immortal", name: "Display", price: 8.00 , img: "https://i.postimg.cc/hGSnHHqV/5a1248b3_6c76_4ad8_b6b4_c7c55bd7651b_removalai_preview.png"}
          ]
        }
      ]
    },

    // Package = boleh pilih macam biasa
    "Joki Ranked | Package | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Package",
          items: [
            { qty: "10 Match", name: "Classic", price: 15.00 , img: "https://i.imghippo.com/files/OwPU2346OK.png"},
            { qty: "20 Match", name: "Classic", price: 30.00 , img: "https://i.imghippo.com/files/OwPU2346OK.png"},
            { qty: "30 Match", name: "Classic", price: 40.00 , img: "https://i.imghippo.com/files/OwPU2346OK.png"},
            { qty: "50 Match", name: "Classic", price: 60.00 , img: "https://i.imghippo.com/files/OwPU2346OK.png"},
            { qty: "100 Match", name: "Classic", price: 100.00 , img: "https://i.imghippo.com/files/OwPU2346OK.png"}
          ]
        }
      ]
    },

    // (ikut urutan home.js) Joki Classic dulu, baru Room, Squad, Top Fan, Shop, Charisma
    "Joki Classic | Package | Joki": {
      infoImg: "",
      groups: [
        {
          title: "Package",
          items: [
            { qty: "10 Match", name: "Classic", price: 13.00 , img: "https://i.imghippo.com/files/pPiP6863dkM.png"},
            { qty: "20 Match", name: "Classic", price: 25.00 , img: "https://i.imghippo.com/files/pPiP6863dkM.png"},
            { qty: "30 Match", name: "Classic", price: 36.00 , img: "https://i.imghippo.com/files/pPiP6863dkM.png"},
            { qty: "50 Match", name: "Classic", price: 55.00 , img: "https://i.imghippo.com/files/pPiP6863dkM.png"},
            { qty: "100 Match", name: "Classic", price: 85.00 , img: "https://i.imghippo.com/files/pPiP6863dkM.png"}
          ]
        }
      ]
    },

    "Room Tournament | Package | Nick ID Server": {
      infoImg: "",
      groups: [
        {
          title: "Per Match",
          items: [
            { qty: "1 Match", name: "Per Match", price: 8.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "2 Match", name: "Per Match", price: 16.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "3 Match", name: "Per Match", price: 22.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "4 Match", name: "Per Match", price: 30.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "5 Match", name: "Per Match", price: 36.00 , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"}
          ]
        },
        {
          title: "Per Hour",
          items: [
            { qty: "1 Jam", name: "Per Hour", price: 15.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "2 Jam", name: "Per Hour", price: 26.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "3 Jam", name: "Per Hour", price: 35.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "4 Jam", name: "Per Hour", price: 46.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "5 Jam", name: "Per Hour", price: 57.00 , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"}
          ]
        },
        {
          title: "Package",
          items: [
            { qty: "BO3", name: "Best Of 3", price: 16.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "BO5", name: "Best Of 5", price: 31.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "BO7", name: "Best Of 7", price: 43.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "1 Hari", name: "Per Days", price: 179.00  , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"},
            { qty: "1 Minggu", name: "Per Weeks", price: 949.00 , img: "https://i.imghippo.com/files/AKM8794Sg.jpg"}
          ]
        }
      ]
    },

    "Squad Verified | Promo | Nick ID Server": {
      infoImg: "",
      groups: [
        {
          title: "Promo",
          items: [
            { qty: "7 Hari", name: "Random Squad", price: 8.00  , img: "https://i.imghippo.com/files/KOt5181tVQ.png"},
            { qty: "14 Hari", name: "Random Squad", price: 16.00  , img: "https://i.imghippo.com/files/KOt5181tVQ.png"},
            { qty: "1 Bulan", name: "Random Squad", price: 23.00  , img: "https://i.imghippo.com/files/KOt5181tVQ.png"},
            { qty: "2 Bulan", name: "Random Squad", price: 38.00  , img: "https://i.imghippo.com/files/KOt5181tVQ.png"},
            { qty: "3 Bulan", name: "Random Squad", price: 70.00 , img: "https://i.imghippo.com/files/KOt5181tVQ.png"}
          ]
        }
      ]
    },

    "Joki Recall MPL | 1 - 48 Jam | Log-In": {
      infoImg: "",
      groups: [
        {
          title: "Event Limited Time",
          items: [
            { qty: "Joki Recall MPL", name: "Per Recall", price: 99.00 , img: "https://i.imghippo.com/files/IFuW5272tD.jpg"}
          ]
        }
      ]
    },

    "Top Fan Avatar Border | Package | Log-In": {
      infoImg: "",
      groups: [
        {
          title: "Avatar Border",
          items: [
            { qty: "Border Only", name: "Aeroplane Border", price: 255.00 , img: "https://i.imghippo.com/files/tErp6563rs.png"},
            { qty: "Border + 1000 Diamond", name: "Aeroplane Border", price: 285.00 , img: "https://i.imghippo.com/files/tErp6563rs.png"}
          ]
        }
      ]
    },

    "Shop Item | 7 - 8 Hari | Gift": {
      infoImg: "",
      groups: [
        {
          title: "Gift Mobile Legends",
          items: [
            { qty: "Hero", name: "599 Diamond", price: 28.00  , img: "https://i.imghippo.com/files/sBi1068RE.png"},
            { qty: "Elite", name: "599 Diamond", price: 28.00  , img: "https://i.imghippo.com/files/xdF7887aXg.png"},
            { qty: "Special", name: "749 Diamond", price: 35.00  , img: "https://i.imghippo.com/files/NZW2481JTA.png"},
            { qty: "Epic Shop", name: "899 Diamond", price: 41.00  , img: "https://i.imghippo.com/files/lAWo9620NRo.png"},
            { qty: "Lightborn", name: "1089 Diamond", price: 49.00 , img: "https://i.imghippo.com/files/Z7814mk.png"},
            { qty: "Change Name Card", name: "239 Diamond", price: 11.00 , img: "https://i.imghippo.com/files/Fpv3949Oq.png"},
            { qty: "Change Flag Card", name: "300 Diamond", price: 13.00  , img: "https://i.imghippo.com/files/SIe2630NE.png"},
            { qty: "Squad Rename Card", name: "299 Diamond", price: 13.00 , img: "https://i.imghippo.com/files/OnqA4956aY.png"}
          ]
        }
      ]
    },

    "Charisma | 1 - 60 Minit | Gift": {
      infoImg: "",
      groups: [
        {
          title: "Charisma",
          items: [
            { qty: "Layla's Chocolate", name: "8 Diamond", price: 0.50 , img: "https://i.imghippo.com/files/UHN5144ej.png"},
            { qty: "20 Diamond Gift", name: "Boleh Pilih", price: 1.10 , img: "https://i.imghippo.com/files/xiR7637EzY.png"},
            { qty: "Angel Ark", name: "499 Diamond", price: 23.00 , img: "https://i.imghippo.com/files/DRt8079ro.png"},
            { qty: "Paradise Island", name: "499 Diamond", price: 23.00 , img: "https://i.imghippo.com/files/Vkm4784iz.png"},
            { qty: "Goldmoom Lantern", name: "999 Diamond", price: 45.00 , img: "https://i.imghippo.com/files/lWoW7614pCc.png"}
          ]
        }
      ]
    },

    // =========================
    //  TOP-UP GAMES
    // =========================
    "Genshin Impact | 1 - 10 Minit | UID Server": {
      infoImg: "",
      groups: [
        {
          title: "Genesis Crystal",
          items: [
            { qty: "60", name: "Genesis Crystal", price: 3.20  , img: "https://i.imghippo.com/files/hZun2357Zmg.png"},
            { qty: "330", name: "Genesis Crystal", price: 15.90  , img: "https://i.imghippo.com/files/AHA1193dQ.png"},
            { qty: "1090", name: "Genesis Crystal", price: 48.00  , img: "https://i.imghippo.com/files/wa8265BeI.png"},
            { qty: "2240", name: "Genesis Crystal", price: 105.00  , img: "https://i.imghippo.com/files/Ma4344jBs.png"},
            { qty: "3880", name: "Genesis Crystal", price: 160.00  , img: "https://i.imghippo.com/files/Ma4344jBs.png"},
            { qty: "8080", name: "Genesis Crystal", price: 310.00  , img: "https://i.imghippo.com/files/vRI6730hNI.png"},
            { qty: "All In One", name: "Genesis Crystal", price: 625.00 , img: "https://i.imghippo.com/files/vRI6730hNI.png"}
          ]
        },
        {
          title: "Chronal Nexus",
          items: [
            { qty: "60", name: "Chronal Nexus", price: 3.20  , img: "https://i.imghippo.com/files/miT8094K.png"},
            { qty: "330", name: "Chronal Nexus", price: 15.90  , img: "https://i.imghippo.com/files/hfEq6917llE.png"},
            { qty: "1090", name: "Chronal Nexus", price: 48.00  , img: "https://i.imghippo.com/files/rJfl6080sg.png"},
            { qty: "2240", name: "Chronal Nexus", price: 105.00  , img: "https://i.imghippo.com/files/fvhb9436LuY.png"},
            { qty: "3880", name: "Chronal Nexus", price: 160.00  , img: "https://i.imghippo.com/files/fvhb9436LuY.png"},
            { qty: "8080", name: "Chronal Nexus", price: 310.00  , img: "https://i.imghippo.com/files/mIFD2141vew.png"},
            { qty: "All In One", name: "Chronal Nexus", price: 625.00 , img: "https://i.imghippo.com/files/mIFD2141vew.png"}
          ]
        },
        {
          title: "Welkin Moon",
          items: [
            { qty: "1 Welkin Moon", name: "Game Pass", price: 16.00 , img: "https://i.imghippo.com/files/AGum1406g.png"},
            { qty: "3 Welkin Moon", name: "Game Pass", price: 47.00 , img: "https://i.imghippo.com/files/AGum1406g.png"},
            { qty: "5 Welkin Moon", name: "Game Pass", price: 77.00 , img: "https://i.imghippo.com/files/AGum1406g.png"}
          ]
        }
      ]
    },

    "Roblox | 1 - 48 Jam | Log-In": {
  infoImg: "",
  groups: [
    {
      title: "Robux",
      items: [
        { qty: "160",   name: "Robux", price: 8.30 , img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "320",   name: "Robux", price: 17.90, img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "400",   name: "Robux", price: 19.30, img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "800",   name: "Robux", price: 42.00, img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "1700",  name: "Robux", price: 86.00, img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "4500",  name: "Robux", price: 206.00,img: "https://i.imghippo.com/files/CLo2399wJE.png" },
        { qty: "10000", name: "Robux", price: 399.00,img: "https://i.imghippo.com/files/CLo2399wJE.png" }
      ]
    }
  ]
},

    "PUBG Mobile | 1 - 10 Minit | User ID": {
      infoImg: "",
      groups: [
        {
          title: "Unknown Cash",
          items: [
            { qty: "60", name: "Unknown Cash", price: 4.03  , img: "https://i.imghippo.com/files/YGjn3724YFg.png"},
            { qty: "325", name: "Unknown Cash", price: 20.13  , img: "https://i.imghippo.com/files/YGjn3724YFg.png"},
            { qty: "660", name: "Unknown Cash", price: 40.23  , img: "https://i.imghippo.com/files/sCOo8049rP.png"},
            { qty: "1800", name: "Unknown Cash", price: 100.61  , img: "https://i.imghippo.com/files/sCOo8049rP.png"},
            { qty: "3850", name: "Unknown Cash", price: 201.22  , img: "https://i.imghippo.com/files/oJn3215CzA.png"},
            { qty: "8100", name: "Unknown Cash", price: 402.43 , img: "https://i.imghippo.com/files/oJn3215CzA.png"}
          ]
        }
      ]
    },

    "Magic Chess | 1 - 10 Minit | Nick ID Server": {
      infoImg: "",
      groups: [
        {
          title: "Diamond",
items: [
  { qty: "5",        name: "Diamonds", price: 0.40, img: "https://i.imghippo.com/files/dlE4692qEU.png" },
  { qty: "11 + 1",   name: "Diamonds", price: 0.90, img: "https://i.imghippo.com/files/dlE4692qEU.png" },
  { qty: "17 + 2",   name: "Diamonds", price: 1.40, img: "https://i.imghippo.com/files/dlE4692qEU.png" },

  { qty: "25 + 3",   name: "Diamonds", price: 2.00, img: "https://i.imghippo.com/files/EKO1135PQg.png" },
  { qty: "40 + 4",   name: "Diamonds", price: 3.20, img: "https://i.imghippo.com/files/EKO1135PQg.png" },
  { qty: "53 + 6",   name: "Diamonds", price: 4.20, img: "https://i.imghippo.com/files/EKO1135PQg.png" },

  { qty: "77 + 8",   name: "Diamonds", price: 6.10, img: "https://i.imghippo.com/files/hySc9493x.png" },
  { qty: "154 + 16", name: "Diamonds", price: 12.20, img: "https://i.imghippo.com/files/hySc9493x.png" },
  { qty: "217 + 23", name: "Diamonds", price: 17.20, img: "https://i.imghippo.com/files/hySc9493x.png" },

  { qty: "256 + 40", name: "Diamonds", price: 21.00, img: "https://i.imghippo.com/files/WBIF9480NSI.png" },
  { qty: "367 + 41", name: "Diamonds", price: 29.00, img: "https://i.imghippo.com/files/WBIF9480NSI.png" },
  { qty: "503 + 65", name: "Diamonds", price: 40.00, img: "https://i.imghippo.com/files/WBIF9480NSI.png" },

  { qty: "774 + 101",  name: "Diamonds", price: 62.00,  img: "https://i.imghippo.com/files/VEZm9555dcs.png" },
  { qty: "1708 + 302", name: "Diamonds", price: 135.00, img: "https://i.imghippo.com/files/VEZm9555dcs.png" },
  { qty: "4003 + 827", name: "Diamonds", price: 317.00, img: "https://i.imghippo.com/files/VEZm9555dcs.png" }
]
}
]
},

    "Free Fire | 1 - 10 Minit | User ID": {
      infoImg: "",
      groups: [
        {
          title: "Diamond",
          items: [
            { qty: "25", name: "Diamond", price: 1.05  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "100", name: "Diamond", price: 4.00  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "310", name: "Diamond", price: 11.90  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "520", name: "Diamond", price: 19.90  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "1060", name: "Diamond", price: 39.00  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "2180", name: "Diamond", price: 79.00  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "5600", name: "Diamond", price: 196.00  , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"},
            { qty: "11500", name: "Diamond", price: 403.00 , img: "https://i.postimg.cc/Xqv1v5Gz/1732806238_8a9746a68a50cbca52b6.png"}
          ]
        },
        {
          title: "Game Pass",
          items: [
            { qty: "Evo Access", name: "3 Days", price: 2.40  , img: "https://i.postimg.cc/vTm2mngL/evo_3d_9476b683_thumbnail_4096.png"},
            { qty: "Evo Access", name: "7 Days", price: 3.60  , img: "https://i.postimg.cc/GtpgpD8q/evo_7d_e67f3120_thumbnail_4096.png"},
            { qty: "Evo Access", name: "30 Days", price: 10.60  , img: "https://i.postimg.cc/4y323c7w/evo_30d_772b2d91_thumbnail_4096.png"},
            { qty: "Weekly Lite", name: "Game Pass", price: 1.50  , img: "https://i.postimg.cc/vTm2mngP/1353_19539.png"},
            { qty: "Weekly Membership", name: "Game Pass", price: 6.80  , img: "https://i.postimg.cc/sfp5Bx90/1000402868_removebg_preview.png"},
            { qty: "Monthly Membership", name: "Game Pass", price: 34.00 , img: "https://i.postimg.cc/3JYm2hnB/1000402869_removebg_preview.png"}
          ]
        }
      ]
    },

    "Honor Of Kings | 1 - 10 Minit | User ID": {
      infoImg: "",
      groups: [
        {
          title: "Diamond",
items: [
  { qty: "16",   name: "Token", price: 0.90,  img: "https://i.imghippo.com/files/CHW5963ZQ.png" },
  { qty: "80",   name: "Token", price: 4.10,  img: "https://i.imghippo.com/files/CHW5963ZQ.png" },

  { qty: "240",  name: "Token", price: 12.20, img: "https://i.imghippo.com/files/PGnG5042Ko.png" },
  { qty: "400",  name: "Token", price: 21.00, img: "https://i.imghippo.com/files/PGnG5042Ko.png" },

  { qty: "560",  name: "Token", price: 29.00, img: "https://i.imghippo.com/files/xLKf3335C.png" },
  { qty: "830",  name: "Token", price: 41.00, img: "https://i.imghippo.com/files/xLKf3335C.png" },

  { qty: "1245", name: "Token", price: 61.00, img: "https://i.imghippo.com/files/diBe2608nik.png" },
  { qty: "2508", name: "Token", price: 122.00,img: "https://i.imghippo.com/files/diBe2608nik.png" },

  { qty: "4180", name: "Token", price: 203.00,img: "https://i.imghippo.com/files/sIm2416PHQ.png" },
  { qty: "8360", name: "Token", price: 406.00,img: "https://i.imghippo.com/files/sIm2416PHQ.png" }
]
        }
      ]
    },

    // =========================
    //  OTHERS SERVICES
    // =========================
    "Cinemas | Telegram | Request": {
      infoImg: "",
      groups: [
        {
          title: "Display Harga",
          items: [
            { qty: "1 Movie", name: "Movies Series", price: 0.50  , img: ""},
            { qty: "1 Drama", name: "Dramas Series", price: 0.10  , img: ""},
          ]
        }
      ]
    }
  };

  // ===== Pilih gambar asas untuk page ini =====
  // Guna infoImg dari PRODUCT_ITEMS kalau ada, kalau tak fallback ke ?img=
  const keyPresetImg   = `${nama} | ${region} | ${via}`;
  const presetForImage = PRODUCT_ITEMS[keyPresetImg];
  const baseImg        = (presetForImage && presetForImage.infoImg)
    ? presetForImage.infoImg
    : img;

  // ===== Isi UI Produk =====
  (qs("#product-name") || qs("h1")).textContent = nama;
  const rEl = qs("#product-region"); if (rEl) rEl.textContent = region;
  const vEl = qs("#product-via");    if (vEl) vEl.textContent = via;
  const imgEl = qs("#product-img");
  // guna baseImg = infoImg (kalau ada) atau img dari URL
  if (imgEl){ imgEl.src = baseImg; imgEl.alt = nama; imgEl.loading = "eager"; }

  document.title = `DanzStoreGaming/${nama}`;
  const info = qs("#product-info");
  if (info) info.classList.add(type === "limited" ? "gold-theme" : "rgb-theme");

  // ===== Deskripsi ringkas =====
  const descMap = {
    "Mobile Legends": "Top-up Diamond ML original, pantas & sah.",
    "PUBG UC": "Pembelian UC laju dan selamat.",
    "Joki Aspirant & Recall": "Servis joki manual, selamat dan legit.",
    "Cinemas": "Tonton filem & drama terkini dengan harga mesra poket.",
    "First Recharge": "First Recharge selamat, pantas & manual process."
  };
  const dEl = qs("#product-description");
  if (dEl) dEl.textContent = descMap[nama] || "Maklumat produk ini akan dikemaskini.";

  // ===== Toggle Description & Payment =====
  const descSection = qs("#description-section");
  descSection.querySelector(".desc-toggle").addEventListener("click", () => {
    descSection.classList.toggle("open");
    toggleCaret(descSection);
  });
  const paySection = qs("#payment-method");
  paySection.querySelector(".pay-toggle").addEventListener("click", () => {
    paySection.classList.toggle("open");
    toggleCaret(paySection);
  });
  function toggleCaret(section){
    const c = section.querySelector(".caret");
    c.style.transform = section.classList.contains("open") ? "rotate(180deg)" : "rotate(0)";
  }

  // ===== Select Product (support group) =====
  const list = qs("#select-list");

  const makeOne = (qty, name, price, imgSrc, parent)=> {
    const container = parent || list;
    const div = el("div",{class:"option-card"});
    div.dataset.name  = `${qty} ${name}`.trim();
    div.dataset.price = price;

    // jika imgSrc tak diberi, guna baseImg (gambar card info)
    const finalImg = imgSrc || baseImg;

    div.innerHTML = `
      <img src="${finalImg}" alt="${name}">
      <div class="item-title">${qty}</div>
      <div class="item-sub">${name}</div>
      <div class="item-price">RM ${Number(price||0).toFixed(2)}</div>
    `;
    div.addEventListener("click", () => {
      const isJokiRankedPage = (nama === "Joki Ranked" && region === "Per Star" && via === "Joki");
      // untuk Joki Ranked Per Star: kad hanya display, tak boleh pilih
      if (isJokiRankedPage && div.classList.contains("disabled")) return;

      qsa(".option-card").forEach(c=>c.classList.remove("selected"));
      div.classList.add("selected");
    });
    container.appendChild(div);
  };

  let added = false;

  const keyPreset = `${nama} | ${region} | ${via}`;
  const preset = PRODUCT_ITEMS[keyPreset];

  if (preset) {
    // Format lama: array biasa
    if (Array.isArray(preset)) {
      const grid = el("div",{class:"select-grid group-grid"});
      preset.forEach(it =>
        // guna gambar item sendiri kalau ada (it.img), kalau tak, fallback baseImg
        makeOne(it.qty, it.name, it.price, it.img || baseImg, grid)
      );
      list.appendChild(grid);
    }
    // Format baru: ada groups
    else if (preset.groups) {
      preset.groups.forEach(group => {
        if (group.title) {
          const h = el("div",{class:"select-group-title"}, group.title);
          list.appendChild(h);
        }
        const grid = el("div",{class:"select-grid group-grid"});
        (group.items || []).forEach(it =>
          makeOne(it.qty, it.name, it.price, it.img || baseImg, grid)
        );
        list.appendChild(grid);
      });
    }
    added = true;
  }

  // Kalau tiada preset, guna exqty/exname dari link
  if (!added && exqty && exname && !isNaN(exprice)) {
    const grid = el("div",{class:"select-grid group-grid"});
    makeOne(exqty, exname, exprice, baseImg, grid);
    list.appendChild(grid);
    added = true;
  }

  // ============================
  //   JOKI RANKED — RANK SYSTEM
  // ============================
  const RANK_DATA = [
    { tier:"Warrior", divisions:["III","II","I"], stars:3 },
    { tier:"Elite",   divisions:["IV","III","II","I"], stars:4 },
    { tier:"Master",  divisions:["IV","III","II","I"], stars:4 },
    { tier:"Grand Master", divisions:["V","IV","III","II","I"], stars:5 },
    { tier:"Epic",    divisions:["V","IV","III","II","I"], stars:5 },
    { tier:"Legend",  divisions:["V","IV","III","II","I"], stars:5 },
    { tier:"Mythic", divisions:[], starMin:1, starMax:24 },
    { tier:"Honor", divisions:[], starMin:25, starMax:49 },
    { tier:"Glory", divisions:[], starMin:50, starMax:99 },
    { tier:"Immortal", divisions:[], starMin:100, starMax:999 }
  ];

  const RANK_PRICE = {
    "Warrior": 0.50,
    "Elite": 0.80,
    "Master": 1.00,
    "Grand Master": 1.50,
    "Epic": 2.00,
    "Legend": 3.00,
    "Mythic": 5.00,
    "Honor": 6.00,
    "Glory": 7.00,
    "Immortal": 8.00
  };

  function buildRankSteps(){
    const ALL = [];
    RANK_DATA.forEach(r=>{
      if (r.divisions && r.divisions.length){
        r.divisions.forEach(d=>{
          for(let i=1;i<=r.stars;i++){
            ALL.push({
              tier:r.tier,
              rank:`${r.tier} ${d}`,
              star:i,
              price:RANK_PRICE[r.tier] || 0
            });
          }
        });
      } else {
        for(let i=r.starMin;i<=r.starMax;i++){
          ALL.push({
            tier:r.tier,
            rank:r.tier,
            star:i,
            price:RANK_PRICE[r.tier] || 0
          });
        }
      }
    });
    return ALL;
  }

  const RANK_STEPS = buildRankSteps();

  function showRankBooster(){
    const booster = qs("#rank-booster");
    if (!booster) return;
    booster.style.display = "block";

    const fromRank = qs("#from-rank-list");
    const toRank   = qs("#to-rank-list");
    if (!fromRank || !toRank) return;
    if (fromRank.childElementCount > 0 || toRank.childElementCount > 0) return; // elak duplicate

    RANK_DATA.forEach(r => {
      if (r.divisions && r.divisions.length){
        r.divisions.forEach(d => {
          const t = `${r.tier} ${d}`;
          const fromDiv = el("div",{class:"rank-item","data-tier":r.tier,"data-div":d},t);
          const toDiv   = el("div",{class:"rank-item","data-tier":r.tier,"data-div":d},t);
          fromRank.appendChild(fromDiv);
          toRank.appendChild(toDiv);
        });
      } else {
        const fromDiv = el("div",{class:"rank-item","data-tier":r.tier},r.tier);
        const toDiv   = el("div",{class:"rank-item","data-tier":r.tier},r.tier);
        fromRank.appendChild(fromDiv);
        toRank.appendChild(toDiv);
      }
    });

    // click handler rank
    [fromRank, toRank].forEach(container=>{
      container.querySelectorAll(".rank-item").forEach(item=>{
        item.addEventListener("click",()=>{
          container.querySelectorAll(".rank-item").forEach(a=>a.classList.remove("selected"));
          item.classList.add("selected");
          const which = container.id.includes("from") ? "from" : "to";
          loadStars(which);
        });
      });
    });
  }

  function loadStars(which){
    const starBox = qs(`#${which}-star-list`);
    if (!starBox) return;
    starBox.innerHTML = "";

    const rankSel = qs(`#${which}-rank-list .selected`);
    if (!rankSel) return;

    const tier = rankSel.dataset.tier;
    const div  = rankSel.dataset.div || null;
    const rObj = RANK_DATA.find(r=>r.tier===tier);
    if (!rObj) return;

    let min=1, max=1;
    if (rObj.divisions && rObj.divisions.length){
      max = rObj.stars;
    } else {
      min = rObj.starMin;
      max = rObj.starMax;
    }

    for(let i=min;i<=max;i++){
      const s = el("div",{class:"star-item","data-star":String(i)},`${i}★`);
      s.addEventListener("click",()=>{
        starBox.querySelectorAll(".star-item").forEach(a=>a.classList.remove("selected"));
        s.classList.add("selected");
        updateRankResult();
      });
      starBox.appendChild(s);
    }
  }

  function calcStarsInternal(fRank, fStar, tRank, tStar){
    const fromKey = `${fRank.textContent.trim()}|${fStar.dataset.star}`;
    const toKey   = `${tRank.textContent.trim()}|${tStar.dataset.star}`;

    const fromIdx = RANK_STEPS.findIndex(x=>`${x.rank}|${x.star}`===fromKey);
    const toIdx   = RANK_STEPS.findIndex(x=>`${x.rank}|${x.star}`===toKey);

    if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
      return { totalStars:0, totalPrice:0 };
    }

    let totalStars = 0;
    let totalPrice = 0;

    for(let i=fromIdx;i<toIdx;i++){
      totalStars++;
      totalPrice += RANK_STEPS[i].price;
    }
    return { totalStars, totalPrice };
  }

  function updateRankResult(){
    const res = qs("#rank-result");
    if (!res) return;

    const fRank = qs("#from-rank-list .selected");
    const fStar = qs("#from-star-list .selected");
    const tRank = qs("#to-rank-list .selected");
    const tStar = qs("#to-star-list .selected");

    if(!fRank || !fStar || !tRank || !tStar){
      res.innerHTML = "Total Bintang: 0<br>Total Harga: RM 0.00";
      return;
    }

    const { totalStars, totalPrice } = calcStarsInternal(fRank,fStar,tRank,tStar);
    res.innerHTML = `
      Total Bintang: ${totalStars}★<br>
      Total Harga: RM ${totalPrice.toFixed(2)}
    `;
  }

  function getRankCalcForWhatsApp(){
    const fRank = qs("#from-rank-list .selected");
    const fStar = qs("#from-star-list .selected");
    const tRank = qs("#to-rank-list .selected");
    const tStar = qs("#to-star-list .selected");
    if(!fRank || !fStar || !tRank || !tStar) return null;
    const { totalStars, totalPrice } = calcStarsInternal(fRank,fStar,tRank,tStar);
    if(totalStars <= 0 || totalPrice <= 0) return null;

    return {
      fromRank: fRank.textContent.trim(),
      fromStar: Number(fStar.dataset.star),
      toRank:   tRank.textContent.trim(),
      toStar:   Number(tStar.dataset.star),
      totalStars,
      totalPrice
    };
  }

  // Aktifkan Rank Booster jika page = Joki Ranked | Per Star | Joki
  const isJokiRankedPage = (nama === "Joki Ranked" && region === "Per Star" && via === "Joki");
  if (isJokiRankedPage) {
    // semua option card jadi display-only (price list)
    qsa(".option-card").forEach(card => {
      card.classList.add("disabled");
    });
    showRankBooster();
  }

// ===== Buyer Info (auto ikut via / product) =====
  const buyerWrap = qs("#buyer-fields");

  // Placeholder standard untuk semua buyer field
  const BUYER_PLACEHOLDERS = {
    "User Name": "DanzStoreGaming",
    "User ID": "1234567890",
    "Server ID": "12345",
    "Email Moonton": "danzhensem@gmail.com",
    "Pass Moonton": "Danzhensem",
    "UID": "81234567890",
    "Link": "tiktok.com/@../https://..",
    "Tajuk": "Boboiboy",
    "Tahun": "2020",
    "Episode": "1 4 6 7",
    "Jumlah Movie": "2",
    "Jumlah Episode": "14",
    "Req 1 Hero": "Yi Sun Shin",
    "Order (Optional)": "Chang'e Epic",
    "Order Opsional": "Chang'e Epic",
    "Email/No HP/Username": "email / no hp / username",
    "Password": "Danzhensem",
    "ID": "1234567890",
    "Cinama": "Movie / Drama",
    "Server": "Malaysia",
    "Tarikh Match": "02/09/2025",
    "Jam": "13:30",
    "Ban": "10 Ban"
  };

  function isCinemasPage(productName){
    const pn = (productName || "").toLowerCase();
    return pn.includes("cinema") || pn.includes("cinemas");
  }
  
  function calcCinemasTotal() {
  const mode = (document.querySelector("#Mode")?.value || "").trim();
  if (!mode) return null;

  if (mode === "Movie") {
    const n = Number(document.querySelector("#JumlahMovie")?.value || 0);
    if (n < 1) return null;

    const base = n * 0.50;
    const discount = Math.floor(n / 10) * 1.00;
    const total = Math.max(0, base - discount);

    return {
      mode,
      qty: n,
      total: Number(total.toFixed(2))
    };
  }

  if (mode === "Drama") {
    const n = Number(document.querySelector("#JumlahEpisode")?.value || 0);
    if (n < 1) return null;

    const base = n * 0.10;
    const discount = Math.floor(n / 10) * 0.10;
    const total = Math.max(0, base - discount);

    return {
      mode,
      qty: n,
      total: Number(total.toFixed(2))
    };
  }

  return null;
}

  function buyerFieldsFor(v, productName){
    const viaStr = (v || "").toLowerCase();
    const pn     = (productName || "").toLowerCase();

    // Room Tournament
    if (pn.includes("room tournament")) {
      return ["User Name","User ID","Server ID","Tarikh Match","Jam","Ban"];
    }

    // ✅ Cinemas: mula-mula hanya dropdown sahaja
    if (isCinemasPage(productName)) {
      return ["Cinama"];
    }

    // Charisma
    if (pn.includes("charisma")) {
      return ["User Name","User ID","Order Opsional"];
    }

    // Event Ticket Recharge
    if (pn.includes("event ticket recharge")) {
      return ["User Name","User ID","Server ID","Server"];
    }

    // Roblox
    if (pn.includes("roblox")) {
      return ["Email/No HP/Username","Password"];
    }

    // Semua Joki (via = Joki)
    if (viaStr.includes("joki")) {
      return ["User Name","User ID","Server ID","Email Moonton","Pass Moonton","Req 1 Hero"];
    }

    // General Log-In
    if (viaStr.includes("log-in")) {
      return ["User Name","User ID","Server ID","Email Moonton","Pass Moonton","Order (Optional)"];
    }

    // Gift
    if (viaStr.includes("gift")) {
      return ["User Name","User ID","Tarikh Order","Order (Optional)"];
    }

    // USER ID games
    const USER_ID_GAMES = ["pubg","honor of kings","free fire"];
    if (USER_ID_GAMES.some(g => pn.includes(g))) {
      return ["User ID"];
    }

    // Genshin
    if (pn.includes("genshin")) {
      return ["UID","GenshinServer"];
    }

    // Social boost
    const SOCIAL_BOOST = ["tik tok","tiktok","instagram"];
    if (SOCIAL_BOOST.some(s => pn.includes(s))) {
      return ["Link"];
    }

    // Nick ID Server
    if (viaStr.includes("nick id server")) {
      return ["User Name","User ID","Server ID"];
    }

    if (viaStr.trim() === "id") return ["ID"];
    return ["User Name","User ID"];
  }

  // ===== Custom Dropdown Helper (guna class .dsg-select dalam CSS) =====
  let dsgSelectDocListenerAttached = false;

  function initDsgSelects(){
    const wrappers = qsa(".dsg-select");
    wrappers.forEach(wrapper=>{
      if (wrapper.dataset.bound === "1") return;
      wrapper.dataset.bound = "1";

      const display = wrapper.querySelector(".dsg-select-display");
      const menu    = wrapper.querySelector(".dsg-select-menu");
      const hidden  = wrapper.querySelector(".dsg-hidden-input");
      if (!display || !menu || !hidden) return;

      display.addEventListener("click", (e)=>{
        e.stopPropagation();
        const isOpen = wrapper.classList.contains("open");
        qsa(".dsg-select.open").forEach(w=>{ if(w!==wrapper) w.classList.remove("open"); });
        if (!isOpen) wrapper.classList.add("open");
        else wrapper.classList.remove("open");
      });

      menu.querySelectorAll(".dsg-option").forEach(opt=>{
        opt.addEventListener("click",(e)=>{
          e.stopPropagation();
          const value = opt.dataset.value || opt.textContent.trim();
          const label = opt.dataset.label || opt.textContent.trim();
          hidden.value = value;
          display.textContent = label;
          display.dataset.hasValue = "1";
          wrapper.classList.remove("open");

          // special hook
          if (wrapper.dataset.onchange === "toggleCinemasMode" && typeof toggleCinemasMode === "function") {
            toggleCinemasMode();
          }
        });
      });
    });

    if (!dsgSelectDocListenerAttached) {
      document.addEventListener("click", ()=>{
        qsa(".dsg-select.open").forEach(w=>w.classList.remove("open"));
      });
      dsgSelectDocListenerAttached = true;
    }
  }

function applyNumericKeypad(inputEl) {
  // Tel + inputmode numeric = keypad nombor (tanpa spinner macam type=number)
  inputEl.type = "tel";
  inputEl.setAttribute("inputmode", "numeric");
  inputEl.setAttribute("pattern", "[0-9]*");

  // Pastikan user tak boleh isi huruf/simbol (kecuali kosong)
  inputEl.addEventListener("input", () => {
    inputEl.value = (inputEl.value || "").replace(/\D+/g, "");
  });
}

function shouldUseNumericKeypad(labelText) {
  const l = (labelText || "").toLowerCase().trim();

  // ✅ yang memang NUMERIC
  if (l.includes("whatsapp")) return true;
  if (l.includes("nombor") || l.includes("no ")) return true; // nombor/no whatsapp/no telefon
  if (l.includes("jumlah") || l.includes("kuantiti") || l.includes("quantity")) return true;
  if (l.includes("tahun") || l.includes("year")) return true;

  // Whole-word match untuk ID supaya tak “terkena” perkataan lain
  // contoh: "User ID", "Server ID", "UID", "ID"
  if (/\b(uid)\b/.test(l)) return true;
  if (/\b(user\s*id)\b/.test(l)) return true;
  if (/\b(server\s*id)\b/.test(l)) return true;
  if (/\b(id)\b/.test(l)) return true;

  // ❌ selain ini biar keyboard biasa (tajuk/nama/email dll)
  return false;
}

  function makeBuyerField(labelText, inputEl) {
  const fieldWrap = el("div", { class: "buyer-field" });

  const labelEl = el("label", { class: "label" }, labelText);
  fieldWrap.appendChild(labelEl);

  // 🔑 DI SINI LOGIC NUMERIC vs TEXT
  if (shouldUseNumericKeypad(labelText)) {
    applyNumericKeypad(inputEl);
  } else {
    inputEl.type = "text";
    inputEl.removeAttribute("inputmode");
    inputEl.removeAttribute("pattern");
  }

  fieldWrap.appendChild(inputEl);
  return fieldWrap;
}

  function renderBuyer(){
    buyerWrap.innerHTML = "";

    buyerFieldsFor(via, nama).forEach(lbl=>{
      const labelText = (lbl === "GenshinServer") ? "Server" : lbl;

      // ===== CUSTOM DROPDOWN: Genshin Server =====
      if (lbl === "GenshinServer") {
        const selectWrap = el("div", { class:"dsg-select", "data-label":"Server" });

        const display = el("div", {
          class:"dsg-select-display",
          "data-placeholder":"Sila Pilih",
          "data-has-value":"0"
        }, "Sila Pilih");

        const menu = el("div", { class:"dsg-select-menu" });
        ["Asia","America","Europe","T.W H.K M.O"].forEach(val=>{
          menu.appendChild(el("div",{class:"dsg-option","data-value":val}, val));
        });

        const hidden = el("input", {
          type:"hidden",
          id:"GenshinServer",
          class:"dsg-hidden-input",
          "data-label":"Server"
        });

        selectWrap.appendChild(display);
        selectWrap.appendChild(menu);
        selectWrap.appendChild(hidden);

        buyerWrap.appendChild(makeBuyerField(labelText, selectWrap));
      }

      // ===== ✅ CINEMAS: Dropdown Movie/Drama sahaja (mula-mula) =====
else if (lbl === "Cinama") {

  // ===== Dropdown Movie / Drama =====
  const selectWrap = el("div", {
    class: "dsg-select",
    "data-label": "Cinemas",
    "data-onchange": "toggleCinemasMode"
  });

  const display = el("div", {
    class: "dsg-select-display",
    "data-placeholder": "Sila Pilih",
    "data-has-value": "0"
  }, "Sila Pilih");

  const menu = el("div", { class: "dsg-select-menu" });
  ["Movie", "Drama"].forEach(v => {
    menu.appendChild(el("div", {
      class: "dsg-option",
      "data-value": v
    }, v));
  });

  const hidden = el("input", {
    type: "hidden",
    id: "Mode",
    class: "dsg-hidden-input",
    "data-label": "Cinemas"
  });

  selectWrap.appendChild(display);
  selectWrap.appendChild(menu);
  selectWrap.appendChild(hidden);

  buyerWrap.appendChild(makeBuyerField("Cinemas", selectWrap));

  // ===== Extra container =====
  const extra = el("div", { id: "cinemas-extra" });
  buyerWrap.appendChild(extra);

  /* ================= MOVIE ================= */
  const movieBlock = el("div", { id: "cinemas-movie-block" });
  movieBlock.style.display = "none";

  const jumlahMovie = el("input", {
    type: "number",
    min: "1",
    inputmode: "numeric",
    pattern: "[0-9]*",
    placeholder: "Contoh: 2",
    id: "JumlahMovie",
    "data-label": "Jumlah Movie"
  });

  jumlahMovie.addEventListener("input", () => {
    if (jumlahMovie.value && Number(jumlahMovie.value) < 1) {
      jumlahMovie.value = 1;
    }
    renderMovieEntries();
  });

  movieBlock.appendChild(makeBuyerField("Jumlah Movie", jumlahMovie));

  const movieEntries = el("div", { id: "movie-entries" });
  movieBlock.appendChild(movieEntries);

  function renderMovieEntries() {
    movieEntries.innerHTML = "";
    const n = Number(jumlahMovie.value || 0);
    if (!n) return;

    for (let i = 1; i <= n; i++) {
      const t = el("input", {
        type: "text",
        placeholder: `Tajuk Movie ${i}`,
        id: `MovieTitle${i}`,
        "data-label": `Tajuk Movie ${i}`
      });

      const y = el("input", {
        type: "number",
        min: "1900",
        inputmode: "numeric",
        pattern: "[0-9]*",
        placeholder: `Tahun Movie ${i}`,
        id: `MovieYear${i}`,
        "data-label": `Tahun Movie ${i}`
      });

      movieEntries.appendChild(makeBuyerField(`Tajuk (Movie ${i})`, t));
      movieEntries.appendChild(makeBuyerField(`Tahun (Movie ${i})`, y));
    }
  }

  /* ================= DRAMA ================= */
  const dramaBlock = el("div", { id: "cinemas-drama-block" });
  dramaBlock.style.display = "none";

  const episodeInput = el("input", {
    type: "text",
    inputmode: "numeric",
    placeholder: "Contoh: 1 3 5 / 1-7 / 1,4,6",
    id: "EpisodeList",
    "data-label": "Episode"
  });

  // 🔒 sekat huruf
  episodeInput.addEventListener("input", () => {
    episodeInput.value = episodeInput.value.replace(/[^0-9,\\s-]/g, "");
  });

  const jumlahEpisode = el("input", {
    type: "number",
    min: "1",
    inputmode: "numeric",
    pattern: "[0-9]*",
    placeholder: "Contoh: 14",
    id: "JumlahEpisode",
    "data-label": "Jumlah Episode"
  });

  const dramaTitle = el("input", {
    type: "text",
    placeholder: "Contoh: Boboiboy",
    id: "DramaTitle",
    "data-label": "Tajuk"
  });

  const dramaYear = el("input", {
    type: "number",
    min: "1900",
    inputmode: "numeric",
    pattern: "[0-9]*",
    placeholder: "Contoh: 2021",
    id: "DramaYear",
    "data-label": "Tahun"
  });

  dramaBlock.appendChild(makeBuyerField("Episode", episodeInput));
  dramaBlock.appendChild(makeBuyerField("Jumlah Episode", jumlahEpisode));
  dramaBlock.appendChild(makeBuyerField("Tajuk", dramaTitle));
  dramaBlock.appendChild(makeBuyerField("Tahun", dramaYear));

  extra.appendChild(movieBlock);
  extra.appendChild(dramaBlock);

  // ===== Toggle Mode =====
  window.toggleCinemasMode = function () {
    const mode = document.getElementById("Mode")?.value;
    movieBlock.style.display = mode === "Movie" ? "block" : "none";
    dramaBlock.style.display = mode === "Drama" ? "block" : "none";
  };
}

      // ===== CUSTOM DROPDOWN: Server Malaysia/Indonesia (Event Ticket Recharge) =====
      else if (lbl === "Server") {
        const selectWrap = el("div", { class:"dsg-select", "data-label":"Server" });

        const display = el("div", {
          class:"dsg-select-display",
          "data-placeholder":"Sila Pilih",
          "data-has-value":"0"
        }, "Sila Pilih");

        const menu = el("div", { class:"dsg-select-menu" });
        ["Malaysia","Indonesia"].forEach(val=>{
          menu.appendChild(el("div",{class:"dsg-option","data-value":val}, val));
        });

        const hidden = el("input", {
          type:"hidden",
          id:"ServerETR",
          class:"dsg-hidden-input",
          "data-label":"Server"
        });

        selectWrap.appendChild(display);
        selectWrap.appendChild(menu);
        selectWrap.appendChild(hidden);

        buyerWrap.appendChild(makeBuyerField(labelText, selectWrap));
      }

      // ===== CUSTOM DROPDOWN: Tarikh Match (Room Tournament) =====
      else if (lbl === "Tarikh Match") {
        const selectWrap = el("div", { class:"dsg-select", "data-label":lbl });

        const display = el("div", {
          class:"dsg-select-display",
          "data-placeholder":"Sila Pilih",
          "data-has-value":"0"
        }, "Sila Pilih");

        const menu = el("div", { class:"dsg-select-menu" });

        const today = new Date();
        for (let i = 0; i < 60; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const day   = String(d.getDate()).padStart(2,"0");
          const month = String(d.getMonth()+1).padStart(2,"0");
          const year  = d.getFullYear();
          const labelVal = `${day}/${month}/${year}`;
          menu.appendChild(el("div",{class:"dsg-option","data-value":labelVal}, labelVal));
        }

        const hidden = el("input", {
          type:"hidden",
          id:"TarikhMatch",
          class:"dsg-hidden-input",
          "data-label":lbl
        });

        selectWrap.appendChild(display);
        selectWrap.appendChild(menu);
        selectWrap.appendChild(hidden);

        buyerWrap.appendChild(makeBuyerField(labelText, selectWrap));
      }

      // ===== CUSTOM DROPDOWN: Jam =====
      else if (lbl === "Jam") {
        const selectWrap = el("div", { class:"dsg-select", "data-label":lbl });

        const display = el("div", {
          class:"dsg-select-display",
          "data-placeholder":"Sila Pilih",
          "data-has-value":"0"
        }, "Sila Pilih");

        const menu = el("div", { class:"dsg-select-menu" });

        for (let h = 0; h < 24; h++) {
          for (let m of [0, 30]) {
            const hh = String(h).padStart(2,"0");
            const mm = String(m).padStart(2,"0");
            const t = `${hh}:${mm}`;
            menu.appendChild(el("div",{class:"dsg-option","data-value":t}, t));
          }
        }

        const hidden = el("input", {
          type:"hidden",
          id:"Jam",
          class:"dsg-hidden-input",
          "data-label":lbl
        });

        selectWrap.appendChild(display);
        selectWrap.appendChild(menu);
        selectWrap.appendChild(hidden);

        buyerWrap.appendChild(makeBuyerField(labelText, selectWrap));
      }

      // ===== CUSTOM DROPDOWN: Ban =====
      else if (lbl === "Ban") {
        const selectWrap = el("div", { class:"dsg-select", "data-label":lbl });

        const display = el("div", {
          class:"dsg-select-display",
          "data-placeholder":"Sila Pilih",
          "data-has-value":"0"
        }, "Sila Pilih");

        const menu = el("div", { class:"dsg-select-menu" });
        ["6 Ban","10 Ban"].forEach(val=>{
          menu.appendChild(el("div",{class:"dsg-option","data-value":val}, val));
        });

        const hidden = el("input", {
          type:"hidden",
          id:"Ban",
          class:"dsg-hidden-input",
          "data-label":lbl
        });

        selectWrap.appendChild(display);
        selectWrap.appendChild(menu);
        selectWrap.appendChild(hidden);

        buyerWrap.appendChild(makeBuyerField(labelText, selectWrap));
      }

      // ===== Field lain — text input biasa =====
      else {
        const example = BUYER_PLACEHOLDERS[lbl] || lbl;
        const placeholderText = `Contoh: ${example}`;
        const idSafe = lbl.replace(/[^a-z0-9]/ig,"");

        // Tahun: force number
        const isYear = (lbl.toLowerCase() === "tahun");
        const input = el("input",{
          type: isYear ? "number" : "text",
          inputmode: isYear ? "numeric" : "text",
          pattern: isYear ? "[0-9]*" : undefined,
          placeholder: placeholderText,
          id: idSafe,
          "data-label": lbl
        });

        buyerWrap.appendChild(makeBuyerField(labelText, input));
      }
    });

    initDsgSelects();
    if (isCinemasPage(nama)) toggleCinemasMode(); // pastikan hidden betul bila reload
  }

  function toggleCinemasMode(){
    const modeEl = qs("#Mode");
    const mode = modeEl ? (modeEl.value || "").toLowerCase() : "";

    const movieBlock = qs("#cinemas-movie-block");
    const dramaBlock = qs("#cinemas-drama-block");

    if (!movieBlock || !dramaBlock) return;

    if (mode === "movie") {
      movieBlock.style.display = "block";
      dramaBlock.style.display = "none";
    } else if (mode === "drama") {
      movieBlock.style.display = "none";
      dramaBlock.style.display = "block";
    } else {
      movieBlock.style.display = "none";
      dramaBlock.style.display = "none";
    }
  }

  // (kekalkan nama function lama supaya tak pecah code lain)
  function toggleEpisodes(){
    toggleCinemasMode();
  }

  // ===== Payment Method =====
  qsa(".pay-tile").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      qsa(".pay-tile").forEach(x=>x.classList.remove("selected"));
      btn.classList.add("selected");
      qs("#payment-selected").value = btn.dataset.value;
    });
  });

  // ===== Voucher Use =====
// ===== VOUCHER SYSTEM (MUDAH & SELAMAT) =====
const VOUCHERS = {
  "DANZ10": {
    text: "✅ Valid – 10% OFF",
    class: "valid",
    discount: 0.10
  },

  "DANZHENSEM99": {
    text: "🔥 Legendary Code – 99% OFF",
    class: "legend",
    discount: 0.99
  }
};

const voucherEl = qs("#voucher-code");
const voucherStatus = qs("#voucher-status");

qs("#use-voucher").addEventListener("click", () => {
  const code = voucherEl.value.trim().toUpperCase();

  // reset status
  voucherStatus.className = "voucher-status";
  voucherStatus.textContent = "";

  if (!code) {
    voucherStatus.textContent = "⚠️ Sila masukkan kod voucher";
    voucherStatus.classList.add("invalid");
    return;
  }

  const voucher = VOUCHERS[code];

  if (!voucher) {
    voucherStatus.textContent = "❌ Invalid Code";
    voucherStatus.classList.add("invalid");
    return;
  }

  // valid voucher
  voucherStatus.textContent = voucher.text;
  voucherStatus.classList.add(voucher.class);

  // simpan voucher untuk kegunaan lain (harga / WhatsApp)
  window.appliedVoucher = voucher;
});

  // ===== Helper scroll ke error =====
  function focusAndScroll(el){
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof el.focus === "function") el.focus();
  }

  // ===== Custom Error Modal =====
  const errorModal      = qs("#errorModal");
  const errorModalMsg   = qs("#errorModalMessage");
  const errorModalOkBtn = qs("#errorModalOk");

  function showError(message, focusTarget){
    if (!errorModal || !errorModalMsg || !errorModalOkBtn) {
      alert(message);
      focusAndScroll(focusTarget);
      return;
    }
    errorModalMsg.textContent = message;
    errorModal.classList.add("show");

    const close = () => {
      errorModal.classList.remove("show");
      errorModalOkBtn.removeEventListener("click", close);
      errorModal.removeEventListener("click", onBackdrop);
      if (focusTarget) focusAndScroll(focusTarget);
    };
    const onBackdrop = (e) => {
      if (e.target === errorModal) close();
    };

    errorModalOkBtn.addEventListener("click", close);
    errorModal.addEventListener("click", onBackdrop);
  }

  // ===== WhatsApp Submit =====
  qs("#confirmOrderBtn").addEventListener("click", () => {
    // buang highlight lama
    qsa(".input-error").forEach(e => e.classList.remove("input-error"));

    const isJokiRankedNow = (nama === "Joki Ranked" && region === "Per Star" && via === "Joki");
    let selected = qs(".option-card.selected");

    // 1) ITEM MESTI DIPILIH — kecuali Joki Ranked Per Star (guna Rank Booster)
    if (!selected && !isJokiRankedNow) {
      showError("Sila pilih item di bahagian Select Product.", qs("#select-product"));
      return;
    }

    // 2) BUYER INFORMATION MESTI LENGKAP (kecuali 'Optional')
let firstMissing = null;
qsa("#buyer-fields input, #buyer-fields select").forEach(input => {
  // skip hidden input (dropdown custom guna hidden input)
  if ((input.type || "").toLowerCase() === "hidden") return;

  // skip element yang memang tak visible (termasuk parent display:none)
  if (input.offsetParent === null) return;

  const rawLabel = (input.dataset.label || input.placeholder || input.id || "").trim();
  const isOptional = /optional|opsional/i.test(rawLabel);
  const value = (input.value || "").trim();

  if (!isOptional && !value && !firstMissing) {
    firstMissing = { input, label: rawLabel };
  }
});

// ✅ Cinemas validation ikut Mode (Movie / Drama)
if (!firstMissing && isCinemasPage(nama)) {
  const mode = (qs("#Mode")?.value || "").trim();
  const cinemasDisplay = qs('[data-label="Cinemas"] .dsg-select-display') || qs("#buyer-info");

  if (!mode) {
    showError("Sila pilih Cinemas.", cinemasDisplay);
    return;
  }

  if (mode === "Movie") {
    const jm = qs("#JumlahMovie");
    const jmVal = (jm?.value || "").trim();
    if (!jmVal) { showError("Sila isi: Jumlah Movie", jm); return; }

    const n = Number(jmVal);
    for (let i = 1; i <= n; i++) {
      const t = qs(`#MovieTitle${i}`);
      const y = qs(`#MovieYear${i}`);
      if (!(t?.value || "").trim()) { showError(`Sila isi: Tajuk (Movie ${i})`, t); return; }
      if (!(y?.value || "").trim()) { showError(`Sila isi: Tahun (Movie ${i})`, y); return; }
    }
  }

  if (mode === "Drama") {
    const ep = qs("#EpisodeList");
    const je = qs("#JumlahEpisode");
    const tt = qs("#DramaTitle");
    const yy = qs("#DramaYear");

    if (!((ep?.value || "").trim())) { showError("Sila isi: Episode", ep); return; }
    if (!((je?.value || "").trim())) { showError("Sila isi: Jumlah Episode", je); return; }
    if (!((tt?.value || "").trim())) { showError("Sila isi: Tajuk", tt); return; }
    if (!((yy?.value || "").trim())) { showError("Sila isi: Tahun", yy); return; }
  }
}

if (firstMissing) {
  firstMissing.input.classList.add("input-error");
  showError(`Sila isi: ${firstMissing.label}`, firstMissing.input);
  return;
}

// 3) PAYMENT METHOD
    const payment = qs("#payment-selected").value.trim();
    if (!payment) {
      showError("Sila pilih Payment Method.", qs("#payment-method"));
      return;
    }

    // 4) NOMBOR WHATSAPP
    const country = (document.getElementById("wa-country")?.value || "MY");
const rawBuyer = (qs("#buyer-phone")?.value || "").trim();
const buyerLocal = normalizeLocalPhone(rawBuyer, country);
const buyerWa = toWhatsAppInternational(buyerLocal, country);

// ini yang masuk dalam message "Buyer:"
const buyerPhone = buyerWa;

    // 5) Kumpul Buyer Information (yang diisi sahaja)
    let buyerInfoLines = "";
    qsa("#buyer-fields input, #buyer-fields select").forEach(input => {
      const style = getComputedStyle(input);
      if (style.display === "none") return;

      const value = (input.value || "").trim();
      if (!value) return;

      let label = (input.dataset.label || input.placeholder || input.id || "").trim();
      label = label.replace(/\s*\(Optional\)/i, "");
      label = label.replace(/\s*\( Drama Sahaja \)/i, "");

      buyerInfoLines += `• ${label}: ${value}\n`;
    });

    // 6) Kira harga
    let total = 0;
    const isCinemasNow = (nama && (nama.toLowerCase().includes("cinema") || nama.toLowerCase().includes("cinemas")));

    function calcMoviePrice(count){
      // 1 movie = 0.50
      // setiap 10 movie diskaun RM1.00 (sebab 10 movie = 4.00)
      const c = Number(count || 0);
      if (c <= 0) return 0;
      const base = 0.50 * c;
      const discount = Math.floor(c / 10) * 1.00;
      return Math.max(0, base - discount);
    }

    function calcDramaPrice(episodes){
      // 1 ep = 0.10
      // setiap 10 ep diskaun RM0.10
      const e = Number(episodes || 0);
      if (e <= 0) return 0;
      const base = 0.10 * e;
      const discount = Math.floor(e / 10) * 0.10;
      return Math.max(0, base - discount);
    }
    let rankSummary = "";

    if (isJokiRankedNow) {
      const calc = getRankCalcForWhatsApp();
      if (!calc) {
        showError("Sila pilih Rank Mula, Star Mula, Rank Target dan Star Target.", qs("#rank-booster"));
        return;
      }
      total = calc.totalPrice;
      rankSummary =
`⭐ *Joki Ranked (Per Star)*  
Dari: ${calc.fromRank} (${calc.fromStar}★)
Ke: ${calc.toRank} (${calc.toStar}★)
Total Bintang: ${calc.totalStars}★

`;
    } else {
      total = parseFloat(selected.dataset.price) || 0;

      // 6b) Jika item adalah Per Star (bukan Joki Ranked sistem baru) → darab StarsQty
      const selectedName = (selected.dataset.name || "").toLowerCase();
      if (selectedName.includes("per star")) {
        const starInput = qs("#StarsQty");
        let stars = parseInt(starInput?.value || "1", 10);
        if (!Number.isFinite(stars) || stars < 1) stars = 1;
        total = total * stars;
      }
    }

// 7) Khas untuk Cinemas / Telegram / Request (Sistem baru: kira ikut JUMLAH)
//    Movie: RM0.50 setiap satu, setiap 10 movie diskaun RM1.00
//    Drama: RM0.10 setiap episod, setiap 10 episod diskaun RM0.10
const namaLower = (nama || "").toLowerCase();
if (namaLower.includes("cinema") || namaLower.includes("cinemas") || namaLower.includes("request")) {
  const modeRaw = (qs("#Mode")?.value || "").trim().toLowerCase();

  if (modeRaw === "movie") {
    const qty = parseInt(qs("#JumlahMovie")?.value || "0", 10);
    if (!Number.isFinite(qty) || qty < 1) {
      showError("Sila isi: Jumlah Movie", qs("#JumlahMovie"));
      return;
    }
    total = calcMoviePrice(qty);
  }
  else if (modeRaw === "drama") {
    const qty = parseInt(qs("#JumlahEpisode")?.value || "0", 10);
    if (!Number.isFinite(qty) || qty < 1) {
      showError("Sila isi: Jumlah Episode", qs("#JumlahEpisode"));
      return;
    }
    total = calcDramaPrice(qty);
  }
}

    // 8) Voucher (optional)
// 8) Voucher (optional) — SISTEM BARU
if (window.appliedVoucher) {
  total = total * (1 - window.appliedVoucher.discount);
}

    // 9) Line item ikut jenis page
    const itemLine = isJokiRankedNow
  ? "⭐ *Item:* Joki Ranked (Per Star)\n"
  : (() => {
      const nm = (nama || "").toLowerCase();
      if (nm.includes("cinema") || nm.includes("cinemas") || nm.includes("request")) {
        const mode = (qs("#Mode")?.value || "").trim();
        if (mode === "Movie") {
          const q = parseInt(qs("#JumlahMovie")?.value || "0", 10);
          if (Number.isFinite(q) && q > 0) return `⭐ *Item:* Movie x${q}\n`;
        }
        if (mode === "Drama") {
          const q = parseInt(qs("#JumlahEpisode")?.value || "0", 10);
          if (Number.isFinite(q) && q > 0) return `⭐ *Item:* Drama x${q}\n`;
        }
      }
      return `⭐ *Item:* ${selected.dataset.name}\n`;
    })();

    // 10) Susun mesej WhatsApp
const message =
`🧾 *Order Baru — DanzStoreGaming.My.Id*

👤 *Buyer:* ${buyerPhone}

🎮 *Product:* ${nama}
📦 *Info:* ${region}
🔐 *Via:* ${via}

${itemLine}${rankSummary}
💳 *Payment:* ${payment}
🎟️ *Voucher:* ${voucherText}
💰 *Total:* RM ${total.toFixed(2)}

📝 *Buyer Info:*
${buyerInfoLines}

🙏 Terima kasih! Danz akan reply secepat mungkin.`;

// ===== OVERRIDE TOTAL UNTUK CINEMAS =====
if (isCinemasPage(nama)) {
  const c = calcCinemasTotal();
  if (!c) {
    showError("Sila lengkapkan maklumat Cinemas.");
    return;
  }

  totalPrice = c.total; // 🔥 INI PENTING
}

    // 11) Redirect ke WhatsApp admin
    const admin = "601139337462";
    window.open(
      `https://wa.me/${admin}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  }); // tutup klik confirmOrderBtn

  // ===== RUN BUYER RENDER + CUSTOM DROPDOWN INIT =====
  renderBuyer();
  toggleEpisodes();
  initDsgSelects();
// ===== MINI ADMIN PANEL =====
const adminPanel = document.getElementById("adminPanel");

let tapCount = 0;

document.querySelector(".header-logo")?.addEventListener("click", () => {
  tapCount++;
  if(tapCount >= 5){
    adminPanel.style.display =
      adminPanel.style.display === "none" ? "block" : "none";
    tapCount = 0;
  }
});

document.getElementById("adminAddBtn")?.addEventListener("click", () => {
  const phone = document.getElementById("adminPhone").value.trim();
  const amount = Number(document.getElementById("adminAmount").value);

  if(!phone || !amount){
    alert("Isi phone & amount dulu.");
    return;
  }

  const current = getWallet(phone);
  const newBal = current + amount;

  setWallet(phone, newBal);

  alert("Balance updated!\nNew Balance: " + formatMoney(newBal));

  document.getElementById("adminPhone").value = "";
  document.getElementById("adminAmount").value = "";
});

// ===== COUNTRY DROPDOWN CUSTOM =====
const selected = document.getElementById("countrySelected");
const options  = document.getElementById("countryOptions");

let currentCountry = "MY";

selected.addEventListener("click", ()=>{
  options.style.display = options.style.display === "block" ? "none" : "block";
});

document.querySelectorAll(".country-option").forEach(opt=>{
  opt.addEventListener("click", ()=>{
    selected.innerHTML = opt.textContent + ' <i class="fa-solid fa-chevron-down"></i>';
    currentCountry = opt.dataset.value;
    options.style.display = "none";
  });
});

function getSelectedCountry(){
  return currentCountry;
}

});   // tutup DOMContentLoaded