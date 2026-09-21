// app.js — DEPOKONTROL arayüz mantığı
const state = {
  token: localStorage.getItem("token") || null,
  username: localStorage.getItem("username") || null,
  role: localStorage.getItem("role") || null,
  view: "ozet",
  cache: {},
  secilenKritikUrunler: new Set(),
  kritikFiltreAktif: false,
};

const TITLES = {
  ozet: "Özet",
  envanter: "Envanter",
  stokgiris: "Stok Girişi",
  stokcikis: "Stok Çıkışı",
  satinalmatalebiolustur: "Satın Alma Talebi Oluştur",
  satinalma: "Satın Alma Talepleri",
  demirbas: "Demirbaş / Zimmet",
  stokkartlari: "Stok Kartları",
  musterikartlari: "Müşteri Kartları",
  cariislemler: "Cari Hesap Takibi",
  ayarlar: "Ayarlar",
  kullanicilar: "Kullanıcılar",
  faturalar: "Fatura Geçmişi",
  raporlar: "Detaylı Raporlar",
  tekneuretim: "Tekne Üretim Atölyesi",
  mesaitakip: "Personel Mesai Girişi"
};

// ---------------- API yardımcı ----------------
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || "Bir hata oluştu.");
  return data;
}

function toast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 3500);
}

function fmtDate() {
  return new Date().toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function selectHtml(name, options, defaultText = "Seçiniz") {
  return `<select name="${name}" id="sel_${name}"><option value="">${defaultText}</option>${(options || [])
    .map((o) => `<option value="${escapeHtml(o.deger)}">${escapeHtml(o.deger)}</option>`)
    .join("")}</select>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function excelTarihCevir(veri) {
  if (!veri) return "";
  if (!isNaN(veri) && Number(veri) > 30000) {  
    const seriGun = Number(veri);
    const dateObj = new Date(Math.round((seriGun - 25569) * 86400 * 1000));
    return dateObj.toISOString().split("T")[0];
  }
  return String(veri).trim();
}

// ---------------- Giriş / Çıkış ----------------
const loginScreen = document.getElementById("loginScreen");
const appEl = document.getElementById("app");

function showApp() {
  loginScreen.hidden = true;
  appEl.hidden = false;
  document.getElementById("whoName").textContent = state.username;
  
  let roleTitle = state.role;
  if (state.role === "yonetici") roleTitle = "Yönetici";
  if (state.role === "satinalma") roleTitle = "Satın Alma";
  if (state.role === "depopersoneli") roleTitle = "Depo Personeli";
  if (state.role === "personel") roleTitle = "Personel";
  document.getElementById("whoRole").textContent = roleTitle;
  
  document.getElementById("headerDate").textContent = fmtDate();

  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(btn => {
    const v = btn.dataset.view;
    btn.style.display = "block";

    if (state.role === "satinalma") {
      if (["stokgiris", "stokcikis", "demirbas", "stokkartlari", "musterikartlari", "kullanicilar", "tekneuretim", "faturalar", "raporlar", "raporlar-ana", "ayarlar", "ayarlar-ana", "depoislemleri-ana", "mesaitakip"].includes(v)) {
        btn.style.display = "none";
      }
    } else if (state.role === "depopersoneli") {
      if (["kullanicilar", "cariislemler", "musterikartlari", "tekneuretim"].includes(v)) {
        btn.style.display = "none";
      }
    } else if (state.role === "personel") {
      if (!["satinalmatalebiolustur", "satinalma", "ozet"].includes(v)) {
        btn.style.display = "none";
      }
    }
  });

  if (state.role === "satinalma") {
    document.querySelectorAll(".nav-group").forEach(group => {
      if (group.textContent.includes("Detaylı Raporlar") || group.textContent.includes("Ayarlar") || group.textContent.includes("Fatura Geçmişi") || group.textContent.includes("Tekne Üretim") || group.textContent.includes("Personel")) {
        group.style.display = "none";
      }
    });
  }

  if (state.role === "personel" && !["satinalmatalebiolustur", "satinalma"].includes(state.view)) {
    state.view = "satinalmatalebiolustur";
  } else if (state.role === "depopersoneli" && ["kullanicilar", "tekneuretim"].includes(state.view)) {
    state.view = "ozet";
  } else if (state.role === "satinalma" && !["ozet", "depoislemleri-ana", "envanter", "satinalma-ana", "satinalmatalebiolustur", "satinalma", "cariislemler"].includes(state.view)) {
    state.view = "ozet";
  }

  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.nav-item[data-view="${state.view}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }

  if (state.role === "satinalma") {
    const dropdown = document.getElementById("satinalmaDropdown");
    const arrow = document.getElementById("satinalmaArrow");
    if (dropdown) dropdown.style.display = "block";
    if (arrow) arrow.style.transform = "rotate(90deg)";
  }
  
  renderView(state.view);
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.hidden = true;
  try {
    const data = await api("POST", "/api/auth/login", { username, password });
    state.token = data.token;
    state.username = data.username;
    state.role = data.role;
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", data.username);
    localStorage.setItem("role", data.role);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  state.token = null;
  location.reload();
});

if (state.token) showApp();

// ---------------- Navigasyon ve Açılır Menü (Akordiyon) Kontrolleri ----------------
window.toggleDepoIslemleriMenu = function() {
  const dropdown = document.getElementById("depoIslemleriDropdown");
  const arrow = document.getElementById("depoIslemleriArrow");
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
    arrow.style.transform = "rotate(90deg)";
  } else {
    dropdown.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
};

window.toggleSatinalmaMenu = function() {
  const dropdown = document.getElementById("satinalmaDropdown");
  const arrow = document.getElementById("satinalmaArrow");
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
    arrow.style.transform = "rotate(90deg)";
  } else {
    dropdown.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
};

window.togglePersonelMenu = function() {
  const dropdown = document.getElementById("personelDropdown");
  const arrow = document.getElementById("personelArrow");
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
    arrow.style.transform = "rotate(90deg)";
  } else {
    dropdown.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
};

window.toggleRaporlarMenu = function() {
  const dropdown = document.getElementById("raporlarDropdown");
  const arrow = document.getElementById("raporlarArrow");
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
    arrow.style.transform = "rotate(90deg)";
  } else {
    dropdown.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
};

window.toggleAyarlarMenu = function() {
  const dropdown = document.getElementById("ayarlarDropdown");
  const arrow = document.getElementById("ayarlarArrow");
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
    arrow.style.transform = "rotate(90deg)";
  } else {
    dropdown.style.display = "none";
    arrow.style.transform = "rotate(0deg)";
  }
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!btn.dataset.view || btn.classList.contains('nav-dropdown-toggle')) {
      return;
    }
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderView(btn.dataset.view);
    document.querySelector(".sidebar").classList.remove("open");
  });
});

async function renderView(view) {
  if (view === "depoislemleri-ana" || view === "satinalma-ana" || view === "personel-ana" || view === "raporlar-ana" || view === "ayarlar-ana" || !view) {
    let modulAdi = "Modül";
    let aciklama = "Lütfen sol menüden alt işlemleri seçiniz.";
    
    if (view === "depoislemleri-ana") { modulAdi = "Depo İşlemleri Modülü"; }
    else if (view === "satinalma-ana") { modulAdi = "Satın Alma İşlemleri Modülü"; }
    else if (view === "personel-ana") { modulAdi = "Personel Modülü"; }
    else if (view === "raporlar-ana" || view === "raporlar") { 
      modulAdi = "Detaylı Raporlar Modülü"; 
      aciklama = "Lütfen sol menüden görüntülemek istediğiniz raporu seçiniz.";
      if (view === "raporlar-ana") {
        state.view = "raporlar";
        document.getElementById("viewTitle").textContent = "Detaylı Raporlar";
        await renderRaporlar(document.getElementById("viewBody"));
        return;
      }
    }
    else if (view === "ayarlar-ana") { modulAdi = "Sistem Ayarları Modülü"; }

    document.getElementById("viewBody").innerHTML = `
      <div class="card" style="text-align: center; padding: 40px; color: #666;">
        <h3>${modulAdi}</h3>
        <p>${aciklama}</p>
      </div>`;
    return;
  }

  if (state.role === "personel" && !["satinalmatalebiolustur", "satinalma"].includes(view)) {
    view = "satinalmatalebiolustur";
  }
  if (state.role === "depopersoneli" && ["kullanicilar", "tekneuretim"].includes(view)) {
    view = "ozet";
  }
  if (state.role === "satinalma" && !["ozet", "depoislemleri-ana", "envanter", "satinalma-ana", "satinalmatalebiolustur", "satinalma", "stokkartlari", "cariislemler", "musterikartlari"].includes(view)) {
    view = "ozet";
  }

  state.view = view;
  document.getElementById("viewTitle").textContent = TITLES[view] || "";
  const body = document.getElementById("viewBody");
  body.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
  try {
    const renderers = {
      ozet: renderOzet,
      envanter: renderEnvanter,
      stokgiris: renderStokGiris,
      stokcikis: renderStokCikis,
      satinalmatalebiolustur: renderTalepOlustur,
      satinalma: renderSatinalma,
      demirbas: renderDemirbas,
      stokkartlari: renderStokKartlari,
      musterikartlari: renderMusteriKartlari,
      cariislemler: renderCariIslemler,
      ayarlar: renderAyarlar,
      kullanicilar: renderKullanicilar,
      faturalar: renderFaturalar,
      raporlar: renderRaporlar,
      tekneuretim: renderTekneUretim,
      mesaitakip: renderMesaiTakip
    };
    
    if (typeof renderers[view] !== 'function') {
      body.innerHTML = '<div class="card" style="text-align: center; padding: 30px; color: #666;">Lütfen soldaki menüden bir alt seçenek seçin.</div>';
      return;
    }

    await renderers[view](body);
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div>${escapeHtml(err.message)}</div>`;
  }
}

// ================= ÖZET =================
async function renderOzet(body) {
  const d = await api("GET", "/api/rapor/ozet");
  body.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat-card accent"><div class="stat-label">Stok Kalemi</div><div class="stat-value">${d.toplamKalem}</div></div>
      <div class="card stat-card ok"><div class="stat-label">Toplam Adet</div><div class="stat-value">${d.toplamMiktar}</div></div>
      <div class="card stat-card warn"><div class="stat-label">Zimmetli Demirbaş</div><div class="stat-value">${d.zimmetliSayisi}</div></div>
      <div class="card stat-card danger"><div class="stat-label">Hurdaya Ayrılan</div><div class="stat-value">${d.hurdaSayisi}</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="section-title">Son Stok Çıkışları</div>
        ${renderMiniTable(d.sonCikislar, [
          ["malzeme_tanim", "Malzeme"],
          ["miktar", "Miktar"],
          ["teslim_edilen", "Teslim Alan"],
        ])}
      </div>
      <div class="card">
        <div class="section-title">Son Stok Girişleri</div>
        ${renderMiniTable(d.sonGirisler, [
          ["malzeme_tanim", "Malzeme"],
          ["miktar", "Miktar"],
          ["tedarikci", "Tedarikçi"],
        ])}
      </div>
    </div>`;
}

function renderMiniTable(rows, cols) {
  if (!rows || !rows.length)
    return '<div class="empty-state">Henüz kayıt yok.</div>';
  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>${cols.map((c) => `<th>${c[1]}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((r) => 
          `<tr>${cols.map((c) => `<td>${escapeHtml(r[c[0]])}</td>`).join("")}</tr>`
        ).join("")}
      </tbody>
    </table>
  </div>`;
}

// ================= STOK KARTLARI =================
async function renderStokKartlari(body) {
  const isYonetici = state.role === "yonetici";
  const [kartlar, kategoriler, birimler] = await Promise.all([
    api("GET", "/api/stok-kartlari"),
    api("GET", "/api/ayarlar?tip=kategori"),
    api("GET", "/api/ayarlar?tip=birim")
  ]);

  body.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Yeni Stok Kartı Oluştur</div>
        <form id="stokKartiForm">
          <div class="form-grid">
            <div class="field"><label>Malzeme Kodu</label><input name="malzeme_kodu" placeholder="Benzersiz Kod (İsteğe Bağlı)"></div>
            <div class="field"><label>Malzeme Adı *</label><input name="malzeme_adi" required></div>
            <div class="field"><label>Kategori</label>${selectHtml("kategori", kategoriler, "Kategori Seçin")}</div>
            <div class="field"><label>Birim</label>${selectHtml("birim", birimler)}</div>
            <div class="field"><label>Kritik Stok Seviyesi</label><input name="kritik_stok" type="number" step="any" value="0"></div>
            <div class="field"><label>Varsayılan Raf</label><input name="raf_adresi"></div>
            <div class="field span-2"><label>Açıklama</label><textarea name="aciklama" rows="2"></textarea></div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px" type="submit">✅ Stok Kartını Ekle</button>
        </form>
      </div>
      <div class="card">
        <div class="section-title">Kayıtlı Stok Kartları (${kartlar.length})</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Kod</th><th>Ad</th><th>Kategori</th><th>Birim</th><th>İşlem</th></tr></thead>
            <tbody>${kartlar.map(k => `
              <tr>
                <td class="mono">${escapeHtml(k.malzeme_kodu || "—")}</td>
                <td><b>${escapeHtml(k.malzeme_adi)}</b></td>
                <td>${escapeHtml(k.kategori || "—")}</td>
                <td>${escapeHtml(k.birim || "—")}</td>
                <td style="text-align:right;">
                  ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" onclick="stokKartiSil(${k.id})">Sil</button>` : ''}
                </td>
              </tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">Kayıtlı stok kartı bulunmuyor.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  document.getElementById("stokKartiForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/stok-kartlari", Object.fromEntries(new FormData(e.target)));
      toast("Stok kartı başarıyla eklendi.");
      renderStokKartlari(body);
    } catch(err) { toast(err.message, true); }
  };

  window.stokKartiSil = async (id) => {
    if(!confirm("Bu stok kartını silmek istediğinize emin misiniz?")) return;
    try {
      await api("POST", `/api/stok-kartlari/${id}/sil`);
      toast("Stok kartı silindi.");
      renderStokKartlari(document.getElementById("viewBody"));
    } catch(err) { toast(err.message, true); }
  };
}

window.stokKaydiKopyala = function(f) {
  const form = document.getElementById("stokGirisForm");
  if (!form) return;
  
  if (form.elements["malzeme_kodu"]) form.elements["malzeme_kodu"].value = f.malzeme_kodu || "";
  if (form.elements["malzeme_adi"]) form.elements["malzeme_adi"].value = f.malzeme_tanim || "";
  if (form.elements["raf_adresi"]) form.elements["raf_adresi"].value = f.raf_adresi || "";
  if (form.elements["miktar"]) form.elements["miktar"].value = f.miktar || "";
  if (form.elements["birim"]) form.elements["birim"].value = f.birim || "Adet";
  if (form.elements["kategori"]) form.elements["kategori"].value = f.kategori || "";
  if (form.elements["lot_no"]) form.elements["lot_no"].value = f.lot_no || "";
  if (form.elements["uretim_tarihi"]) form.elements["uretim_tarihi"].value = f.uretim_tarihi || "";
  if (form.elements["skt"]) form.elements["skt"].value = f.skt || "";
  if (form.elements["fatura_no"]) form.elements["fatura_no"].value = f.fatura_no || "";
  if (form.elements["fatura_tarihi"]) form.elements["fatura_tarihi"].value = f.fatura_tarihi || "";
  if (form.elements["birim_fiyati"]) form.elements["birim_fiyati"].value = f.birim_fiyati || "";
  if (form.elements["para_birimi"]) form.elements["para_birimi"].value = f.para_birimi || "TL";
  if (form.elements["tedarikci"]) form.elements["tedarikci"].value = f.tedarikci || "";

  toast("Kayıt forma kopyalandı! Bilgileri değiştirerek hızlıca yeni giriş yapabilirsiniz.");
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.stokKaydiDuzenle = function(f) {
  faturaDuzenleModal(f.id, f.malzeme_kodu || "", f.malzeme_tanim, f.miktar, f.fatura_no || "", f.fatura_tarihi || "", f.birim_fiyati || "", f.para_birimi || "", f.tedarikci || "", f.kategori || "", f.lot_no || "");
};

// ================= MÜŞTERİ KARTLARI =================
async function renderMusteriKartlari(body) {
  const musteriler = await api("GET", "/api/musteri-kartlari");
  
  body.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Yeni Müşteri / Proje Ekle</div>
        <form id="musteriForm">
          <div class="form-grid">
            <div class="field span-2"><label>Müşteri / Firma Adı *</label><input name="musteri_adi" required></div>
            <div class="field"><label>Yetkili Kişi</label><input name="yetkili"></div>
            <div class="field"><label>Telefon</label><input name="telefon"></div>
            <div class="field"><label>E-Posta</label><input name="eposta"></div>
            <div class="field"><label>Vergi No / TC</label><input name="vergi_no"></div>
            <div class="field span-2"><label>Adres</label><textarea name="adres" rows="2"></textarea></div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px" type="submit">✅ Müşteri Ekle</button>
        </form>
      </div>
      <div class="card">
        <div class="section-title">Müşteri Listesi (${musteriler.length})</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Firma Adı</th><th>Yetkili</th><th>Telefon</th><th>İşlem</th></tr></thead>
            <tbody>${musteriler.map(m => `
              <tr>
                <td><b>${escapeHtml(m.musteri_adi)}</b></td>
                <td>${escapeHtml(m.yetkili || "—")}</td>
                <td>${escapeHtml(m.telefon || "—")}</td>
                <td style="text-align:right;">
                  <button class="btn btn-sm btn-danger-outline" onclick="musteriSil(${m.id})">Sil</button>
                </td>
              </tr>`).join("") || `<tr><td colspan="4"><div class="empty-state">Kayıtlı müşteri bulunmuyor.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;


  document.getElementById("musteriForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/musteri-kartlari", Object.fromEntries(new FormData(e.target)));
      toast("Müşteri başarıyla eklendi.");
      renderMusteriKartlari(body);
    } catch(err) { toast(err.message, true); }
  };

  window.musteriSil = async (id) => {
    if(!confirm("Müşteriyi sistemden silmek istediğinize emin misiniz?")) return;
    try {
      await api("POST", `/api/musteri-kartlari/${id}/sil`);
      toast("Müşteri silindi.");
      renderMusteriKartlari(document.getElementById("viewBody"));
    } catch(err) { toast(err.message, true); }
  };
}



// ================= CARİ İŞLEMLER =================
async function renderCariIslemler(body) {
  const isYonetici = state.role === "yonetici";
  let aktifCari = localStorage.getItem("sonSeciliCari") || "";

  const [ozet, islemler, paraBirimleri, tedarikciler] = await Promise.all([
    api("GET", "/api/cari-ozet"),
    api("GET", "/api/cari-islemler"),
    api("GET", "/api/ayarlar?tip=para_birimi"),
    api("GET", "/api/musteri-kartlari")
  ]);

  const cariIsimlerSet = new Set([
    ...ozet.map(o => o.tedarikci_adi),
    ...islemler.map(i => i.tedarikci_adi),
    ...tedarikciler.map(t => t.musteri_adi)
  ]);
  const cariListesi = [...cariIsimlerSet].filter(Boolean).sort();

  body.innerHTML = `
    <div class="card" style="margin-bottom: 16px; background-color: #f8f9fa; border: 1px solid #e9ecef;">
      <div style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px;">
          <label style="font-size: 13px; font-weight: bold; color: #333; display: block; margin-bottom: 6px;">📄 Firma / Cari Hesap Seçin</label>
          <select id="cariSecimSelect" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 15px; font-weight: bold; cursor: pointer;">
            <option value="">-- Tüm Firmalar (Genel Bakiye Özeti) --</option>
            ${cariListesi.map(c => `<option value="${escapeHtml(c)}" ${aktifCari === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        <div style="flex: 0 0 auto;">
          <button class="btn btn-primary" id="btnOdemeModal" style="background-color: #28a745; border: none; padding: 10px 20px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
            💸 Yeni Ödeme / İşlem Ekle
          </button>
        </div>
      </div>
    </div>
    
    <div id="cariDetayAlani"></div>
  `;

  function renderDetay(secilenFirma) {
    const detayAlani = document.getElementById("cariDetayAlani");
    
    if (!secilenFirma) {
      detayAlani.innerHTML = `
        <div class="card">
          <div class="section-title">Tüm Firmaların Güncel Bakiye Özeti</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Firma / Cari Adı</th>
                  <th style="text-align: right;">Toplam Alınan Mal (Borç)</th>
                  <th style="text-align: right;">Toplam Yapılan Ödeme (TL Karşılığı)</th>
                  <th style="text-align: right;">Kalan Net Bakiye</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>${ozet.map(o => {
                const bakiyeSayi = (o.toplam_borc || 0) - (o.toplam_odeme_tl || o.toplam_odeme || 0);
                const bakiyeRenk = bakiyeSayi > 0 ? '#d9534f' : (bakiyeSayi < 0 ? '#28a745' : '#333');
                const durumStr = bakiyeSayi > 0 ? 'FİRMAYA BORCUMUZ VAR' : (bakiyeSayi < 0 ? 'FİRMADAN ALACAKLIYIZ' : 'BAKİYE SIFIR');
                return `
                <tr style="cursor: pointer;" onclick="document.getElementById('cariSecimSelect').value='${escapeHtml(o.tedarikci_adi)}'; document.getElementById('cariSecimSelect').dispatchEvent(new Event('change'));" title="Detayları görmek için tıklayın">
                  <td><b>${escapeHtml(o.tedarikci_adi)}</b></td>
                  <td class="num-cell" style="text-align: right;">${(o.toplam_borc || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                  <td class="num-cell" style="color:#28a745; text-align: right;">${(o.toplam_odeme_tl || o.toplam_odeme || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                  <td class="num-cell" style="color:${bakiyeRenk}; font-weight:bold; font-size:14px; text-align: right;">${Math.abs(bakiyeSayi).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                  <td><span class="badge" style="background-color: ${bakiyeSayi > 0 ? '#d9534f' : (bakiyeSayi < 0 ? '#28a745' : '#6c757d')}; color: white; font-size: 11px;">${durumStr}</span></td>
                </tr>`;
              }).join("") || `<tr><td colspan="5"><div class="empty-state">Kayıtlı bakiye bulunmuyor.</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      const firmaOzetObj = ozet.find(o => o.tedarikci_adi === secilenFirma) || { toplam_borc: 0, toplam_odeme_tl: 0 };
      const firmaIslemler = islemler.filter(i => i.tedarikci_adi === secilenFirma);
      
      const toplamBorc = firmaOzetObj.toplam_borc || 0;
      const toplamOdemeTl = firmaOzetObj.toplam_odeme_tl || firmaOzetObj.toplam_odeme || 0;
      const netBakiye = toplamBorc - toplamOdemeTl;
      
      let durumStr = netBakiye > 0 ? 'FİRMAYA BORCUMUZ VAR' : (netBakiye < 0 ? 'FİRMADAN ALACAKLIYIZ' : 'BAKİYE SIFIR');
      let renk = netBakiye > 0 ? '#d9534f' : (netBakiye < 0 ? '#28a745' : '#6c757d');
      
      let bakiyeKartlariHtml = `
         <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; flex: 1; min-width: 220px; border-left: 4px solid #0275d8; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
           <div style="font-size: 12px; color: #666; font-weight: bold; text-transform: uppercase;">Toplam Fatura (Borç)</div>
           <div style="font-size: 22px; font-weight: bold; color: #0275d8; margin: 8px 0;">${toplamBorc.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
         </div>
         <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; flex: 1; min-width: 220px; border-left: 4px solid #28a745; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
           <div style="font-size: 12px; color: #666; font-weight: bold; text-transform: uppercase;">Toplam Yapılan Ödeme (TL Karşılığı)</div>
           <div style="font-size: 22px; font-weight: bold; color: #28a745; margin: 8px 0;">${toplamOdemeTl.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
         </div>
         <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; flex: 1; min-width: 220px; border-left: 4px solid ${renk}; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
           <div style="font-size: 12px; color: #666; font-weight: bold; text-transform: uppercase;">Net Bakiye Durumu</div>
           <div style="font-size: 22px; font-weight: bold; color: ${renk}; margin: 8px 0;">${Math.abs(netBakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
           <div style="font-size: 11px; color: #888;">Durum: <b>${durumStr}</b></div>
         </div>
      `;

      detayAlani.innerHTML = `
        <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 16px;">
          ${bakiyeKartlariHtml}
        </div>
        
        <div class="card">
          <div class="section-title">Hesap Ekstresi ve Hareket Geçmişi - ${escapeHtml(secilenFirma)}</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>İşlem Tipi</th>
                  <th>Belge / Açıklama</th>
                  <th>Ödeme Dövizi ve Tutarı</th>
                  <th style="text-align: right;">Fatura (Borç) TL</th>
                  <th style="text-align: right;">Ödenen (Alacak) TL Karşılığı</th>
                  <th style="text-align: right;">İşlem</th>
                </tr>
              </thead>
              <tbody>${firmaIslemler.map(i => {
                const isBorc = i.islem_tipi === 'BORC';
                const dovizGosterim = !isBorc && i.para_birimi && i.para_birimi !== 'TL' ? `${i.tutar} ${i.para_birimi} (Kur: ${i.kur || 1})` : (i.para_birimi || 'TL');
                
                const kurDegeri = num(i.kur) > 0 ? num(i.kur) : 1;
                const tlKarsilik = !isBorc ? num(i.tl_karsiligi) || (num(i.tutar) * kurDegeri) : num(i.tutar);
                
                return `
                <tr>
                  <td class="mono" style="font-size:13px;">${escapeHtml(i.islem_tarihi)}</td>
                  <td>${isBorc ? '<span class="badge badge-danger">Mal Alımı / Fatura</span>' : '<span class="badge badge-ok">Ödeme Yapıldı</span>'}</td>
                  <td>
                    ${i.belge_no ? `<b>Belge:</b> <span class="mono">${escapeHtml(i.belge_no)}</span><br>` : ''}
                    <span style="font-size:12px; color:#666;">${escapeHtml(i.aciklama || "—")}</span>
                  </td>
                  <td><span style="font-weight: bold; color: #444;">${escapeHtml(dovizGosterim)}</span></td>
                  <td class="num-cell" style="color:#d9534f; font-weight:${isBorc ? 'bold' : 'normal'}; text-align: right;">${isBorc ? num(i.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2}) + ' TL' : '-'}</td>
                  <td class="num-cell" style="color:#28a745; font-weight:${!isBorc ? 'bold' : 'normal'}; text-align: right;">${!isBorc ? tlKarsilik.toLocaleString('tr-TR', {minimumFractionDigits: 2}) + ' TL' : '-'}</td>
                  <td style="text-align:right;">
                    ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" onclick="cariIslemSil(${i.id})">Sil</button>` : ''}
                  </td>
                </tr>`;
              }).join("") || `<tr><td colspan="7"><div class="empty-state">Bu firmaya ait hesap hareketi bulunamadı.</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  document.getElementById("cariSecimSelect").addEventListener("change", (e) => {
    aktifCari = e.target.value;
    localStorage.setItem("sonSeciliCari", aktifCari);
    renderDetay(aktifCari);
  });

  renderDetay(aktifCari);

  document.getElementById("btnOdemeModal").addEventListener("click", () => {
    const modalHtml = `
      <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 24px; border-radius: 8px; width: 480px; max-width: 95%; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Cariye Ödeme Ekle</h3>
          <form id="odemeForm">
            <div style="margin-bottom: 15px;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Firma / Tedarikçi Seçin *</label>
              <select name="tedarikci_adi" required style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                <option value="">Firma Seçiniz...</option>
                ${cariListesi.map(c => `<option value="${escapeHtml(c)}" ${aktifCari === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Ödenen Tutar *</label>
                <input name="tutar" id="odemeTutarInput" type="text" required placeholder="Örn: 100 veya 100,50" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
              </div>
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Para Birimi</label>
                <select name="para_birimi" id="odemeParaBirimi" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                  ${paraBirimleri.map(p => `<option value="${escapeHtml(p.deger)}">${escapeHtml(p.deger)}</option>`).join("")}
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;" id="kurAlanKapsayici" hidden>
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Döviz Kuru (TL Karşılığı) *</label>
                <input name="kur" id="odemeKurInput" type="text" placeholder="Örn: 47,74" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Borçtan Düşülecek TL Karşılığı</label>
                <input id="tlKarsilikGosterge" type="text" disabled style="width: 100%; padding: 10px; border: 1px solid #ddd; background: #e9ecef; border-radius: 4px; font-weight: bold; color: #28a745;" value="0.00 TL">
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">İşlem Tarihi</label>
                <input name="islem_tarihi" type="date" required value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <div>
                <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Belge / Dekont No</label>
                <input name="belge_no" placeholder="Örn: TR123..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Açıklama</label>
              <textarea name="aciklama" rows="2" placeholder="Örn: Döviz havalesi yapıldı..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" id="modalOdemeIptal" style="padding: 10px 20px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer; font-weight: bold;">İptal</button>
              <button type="submit" style="padding: 10px 20px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">💸 Ödemeyi Kaydet</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const paraBirimiSelect = document.getElementById("odemeParaBirimi");
    const kurKapsayici = document.getElementById("kurAlanKapsayici");
    const tutarInput = document.getElementById("odemeTutarInput");
    const kurInput = document.getElementById("odemeKurInput");
    const tlGosterge = document.getElementById("tlKarsilikGosterge");

    function kurKontrolEt() {
      const secilenBirim = paraBirimiSelect.value.toUpperCase();
      if (secilenBirim !== "TL") {
        kurKapsayici.hidden = false;
        kurInput.required = true;
      } else {
        kurKapsayici.hidden = true;
        kurInput.required = false;
        kurInput.value = "";
      }
      hesaplaTlKarsilik();
    }

    function hesaplaTlKarsilik() {
      const tutar = num(tutarInput.value);
      const kur = num(kurInput.value) || 1;
      const secilenBirim = paraBirimiSelect.value.toUpperCase();

      if (secilenBirim !== "TL" && !kurKapsayici.hidden) {
        const toplamTl = tutar * kur;
        tlGosterge.value = toplamTl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
      } else {
        tlGosterge.value = tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
      }
    }

    paraBirimiSelect.addEventListener("change", kurKontrolEt);
    tutarInput.addEventListener("input", hesaplaTlKarsilik);
    kurInput.addEventListener("input", hesaplaTlKarsilik);
    kurKontrolEt();

    document.getElementById("modalOdemeIptal").onclick = () => document.getElementById("ozelModal").remove();

    document.getElementById("odemeForm").onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      
      const tutarVal = num(data.tutar);
      const kurVal = num(data.kur) || 1;
      
      data.tutar = tutarVal;

      if (data.para_birimi && data.para_birimi.toUpperCase() !== "TL") {
        data.kur = kurVal;
        data.tl_karsiligi = tutarVal * kurVal;
      } else {
        data.kur = 1;
        data.tl_karsiligi = tutarVal;
      }
      
      document.getElementById("ozelModal").remove();
      
      try {
        await api("POST", "/api/cari-odeme", data);
        toast("Ödeme başarıyla kaydedildi ve borçtan düşüldü.");
        aktifCari = data.tedarikci_adi; 
        localStorage.setItem("sonSeciliCari", aktifCari);
        renderCariIslemler(body);
      } catch(err) { toast(err.message, true); }
    };
  });

  window.cariIslemSil = async (id) => {
    const eski = document.getElementById("ozelModal");
    if (eski) eski.remove();

    const modalHtml = `
      <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 24px; border-radius: 8px; width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <h3 style="margin-top: 0; color: #333; font-size: 18px;">Cari Hareket Silme Onayı</h3>
          <p style="color: #666; font-size: 13px; line-height: 1.4;">Bu finansal hareketi kalıcı olarak silmek istediğinize emin misiniz?</p>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
            <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer;">Evet, Sil</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();

    document.getElementById("modalOnay").onclick = async () => {
      document.getElementById("ozelModal").remove();
      try {
        await api("POST", `/api/cari-islemler/${id}/sil`);
        toast("Cari hareket silindi.");
        renderCariIslemler(document.getElementById("viewBody"));
      } catch(err) { 
        toast(err.message, true); 
      }
    };
  };
}

// ================= ENVANTER (ÜT ve SKT Destekli) =================
async function renderEnvanter(body) {
  const hamRows = await api("GET", "/api/envanter");
  const isYonetici = state.role === "yonetici";
  const isSatinalma = state.role === "satinalma";
  
  const urunMap = {};
  hamRows.forEach(r => {
    const key = (r.malzeme_kodu ? r.malzeme_kodu.trim().toUpperCase() : "") + "_" + r.malzeme_adi.trim().toUpperCase() + "_" + (r.raf_adresi ? r.raf_adresi.trim().toUpperCase() : "");
    if (!urunMap[key]) {
      urunMap[key] = {
        ...r,
        miktar: 0,
        detaylar: []
      };
    }
    urunMap[key].miktar += num(r.miktar);
    urunMap[key].detaylar.push({
      lot_no: r.lot_no || "—",
      uretim_tarihi: r.uretim_tarihi || "—",
      skt: r.skt || "—",
      miktar: r.miktar
    });
  });
  const rows = Object.values(urunMap);

  body.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div class="section-title" style="margin-bottom: 0;" id="envanterBaslik">Depodaki Tüm Ürünler (${rows.length})</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <input type="text" id="envanterArama" placeholder="🔍 Kod, Ad, Lot veya Raf ile Ara..." style="padding: 7px 12px; border: 1px solid #ccc; border-radius: 4px; width: 220px; font-size: 13px;">
          ${isYonetici ? `<button onclick="envanteriSifirlaOnay()" style="background-color: #d9534f; color: white; border: none; padding: 8px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">🗑️ Envanteri Sıfırla</button>` : ""}
          ${!isSatinalma ? `<input type="file" id="excelDosyaInput" accept=".xlsx, .xls, .csv" style="display: none;" onchange="exceldenYukle(event)"><button onclick="document.getElementById('excelDosyaInput').click()" style="background-color: #2b579a; color: white; border: none; padding: 8px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">📤 Excel'den Yükle</button>` : ""}
          <button onclick="exceleAktar()" style="background-color: #107c41; color: white; border: none; padding: 8px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">📥 Excel'e Aktar</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>MALZEME KODU</th>
              <th>MALZEME ADI</th>
              <th>Raf Adresi</th>
              <th>Toplam Miktar</th>
              <th>Üretim Birimi</th>
              <th>Lot No</th>
              <th>Üretim Tarihi</th>
              <th>Son Kullanma Tarihi</th>
              <th>KATEGORİ</th>
              <th style="text-align: right;">İşlemler</th>
            </tr>
          </thead>
          <tbody id="envanterTabloGovde">
            ${renderEnvanterSatirlari(rows)}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("envanterArama").addEventListener("input", (e) => {
    const aranan = e.target.value.toLocaleLowerCase("tr-TR").trim();
    const filtrelenmis = rows.filter(r => {
      const kod = String(r.malzeme_kodu || "").toLocaleLowerCase("tr-TR");
      const ad = String(r.malzeme_adi || "").toLocaleLowerCase("tr-TR");
      const raf = String(r.raf_adresi || "").toLocaleLowerCase("tr-TR");
      const detayStr = r.detaylar.map(d => `${d.lot_no} ${d.uretim_tarihi} ${d.skt}`).join(" ").toLocaleLowerCase("tr-TR");
      return kod.includes(aranan) || ad.includes(aranan) || raf.includes(aranan) || detayStr.includes(aranan);
    });

    document.getElementById("envanterTabloGovde").innerHTML = renderEnvanterSatirlari(filtrelenmis);
    document.getElementById("envanterBaslik", `Depodaki Ürünler (${filtrelenmis.length} / ${rows.length})`);
  });
}

function renderEnvanterSatirlari(rows) {
  const isYonetici = state.role === "yonetici";
  const isSatinalma = state.role === "satinalma";

  if (!rows || !rows.length) {
    return `<tr><td colspan="10"><div class="empty-state">Kriterlere uygun ürün bulunamadı.</div></td></tr>`;
  }
  return rows.map(r => {
    const lotMetni = r.detaylar.map(d => `${d.lot_no || "Belirsiz"} (${d.miktar})`).join("<br>");
    const utMetni = r.detaylar.map(d => d.uretim_tarihi || "—").join("<br>");
    const sktMetni = r.detaylar.map(d => d.skt || "—").join("<br>");

    return `<tr>
      <td class="mono">${escapeHtml(r.malzeme_kodu || "—")}</td>
      <td><b>${escapeHtml(r.malzeme_adi)}</b></td>
      <td>${escapeHtml(r.raf_adresi || "—")}</td>
      <td class="num-cell" style="font-size:14px; font-weight:bold; color: #0275d8;">${r.miktar}</td>
      <td>${escapeHtml(r.birim || "—")}</td>
      <td class="mono" style="color:#0056b3; font-size: 12px;">${lotMetni}</td>
      <td class="mono" style="font-size: 12px;">${utMetni}</td>
      <td class="mono" style="font-size: 12px; color: #d9534f; font-weight: bold;">${sktMetni}</td>
      <td>${escapeHtml(r.kategori || "—")}</td>
      <td style="text-align: right; white-space: nowrap;">
        ${!isSatinalma ? `<button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #f0ad4e; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" onclick="modernDuzenleModal(${r.id}, '${escapeHtml(r.malzeme_kodu || "")}', '${escapeHtml(r.malzeme_adi)}', '${escapeHtml(r.raf_adresi || "")}', ${r.miktar}, '${escapeHtml(r.birim || "Adet")}', '${escapeHtml(r.kategori || "")}', '${escapeHtml(r.lot_no || "")}')">Düzenle</button>` : ""}
        ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" style="padding: 4px 8px; font-size: 11px;" onclick="modernSilOnay(${r.id})">Sil</button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

async function envanteriSifirlaOnay() {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #d9534f; font-size: 18px;">⚠️ GÜVENLİK DOĞRULAMASI</h3>
        <p style="color: #555; font-size: 13px; line-height: 1.4; margin-bottom: 12px;">Depodaki <b>tüm ürünler ve stok miktarları</b> silinecektir. Devam etmek için lütfen giriş şifrenizi girin:</p>
        
        <div style="margin-bottom: 15px;">
          <input type="password" id="sifirlaPass" placeholder="Şifrenizi giriniz..." style="width: 100%; padding: 9px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;" autofocus>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
          <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Onayla ve Sıfırla</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("sifirlaPass").focus();
  document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("modalOnay").onclick = async () => {
    const password = document.getElementById("sifirlaPass").value;
    if (!password) {
      alert("Lütfen şifrenizi girin!");
      return;
    }

    document.getElementById("ozelModal").remove();
    try {
      const r = await api("POST", "/api/envanter/sifirla", { password });
      toast(r.message);
      renderEnvanter(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function exceldenYukle(event) {
  const dosya = event.target.files[0];
  if (!dosya) return;

  const okuyucu = new FileReader();
  okuyucu.onload = async function (e) {
    try {
      const veri = new Uint8Array(e.target.result);
      const calismaKitabi = XLSX.read(veri, { type: "array" });
      const ilkSayfaAdi = calismaKitabi.SheetNames[0];
      const calismaSayfasi = calismaKitabi.Sheets[ilkSayfaAdi];

      const jsonVerileri = XLSX.utils.sheet_to_json(calismaSayfasi, { header: 1 });

      if (!jsonVerileri || jsonVerileri.length === 0) {
        alert("Excel dosyası boş veya okunamadı!");
        return;
      }

      // Herhangi bir kayıt yazmadan önce tüm dosyanın kod/ad eşleşmesini denetle.
      const kontrolSatirlari = jsonVerileri.slice(1).map((row, i) => ({
        excel_row: i + 2,
        malzeme_kodu: String(row?.[0] ?? "").trim(),
        malzeme_adi: String(row?.[1] ?? "").trim(),
      })).filter(row => row.malzeme_kodu || row.malzeme_adi);
      const kontrol = await api("POST", "/api/stok-kartlari/kod-kontrol", { rows: kontrolSatirlari });
      if (!kontrol.ok) {
        alert("Kod / ürün adı çakışması: hiçbir satır yüklenmedi.\n\n" +
          kontrol.errors.slice(0, 20).map(e => `Satır ${e.row}: ${e.error}`).join("\n") +
          (kontrol.errors.length > 20 ? `\nToplam ${kontrol.errors.length} hatalı satır var.` : ""));
        return;
      }
      let basariliSayisi = 0;
      const yuklemeHatalari = [];
      toast("Excel verileri işleniyor, lütfen bekleyin...");

      for (let i = 1; i < jsonVerileri.length; i++) {
        const satir = jsonVerileri[i];
        if (!satir || satir.length === 0) continue;
        const malzeme_kodu = String(satir[0] ?? "").trim();
        const malzeme_adi = String(satir[1] || "").trim();
        const raf_adresi = String(satir[2] || "Genel Depo").trim();
        const miktar = parseFloat(satir[3]) || 1;
        const birim = String(satir[4] || "Adet").trim();
        const lot_no = String(satir[5] || "").trim();
        const kategori = String(satir[6] || "").trim();

        if (malzeme_adi) {
          try {
            await api("POST", "/api/stok-kartlari", {
              malzeme_kodu: malzeme_kodu,
              malzeme_adi: malzeme_adi,
              kategori: kategori,
              birim: birim,
              raf_adresi: raf_adresi,
              kritik_stok: 0,
              aciklama: "Excel yüklemesi ile otomatik oluşturuldu"
            });
          } catch (err) {
            yuklemeHatalari.push(`Satır ${i + 1}: ${err.message}`);
            continue;
          }

          try {
            await api("POST", "/api/stok-giris", {
              malzeme_kodu: malzeme_kodu,
              malzeme_adi: malzeme_adi,
              raf_adresi: raf_adresi,
              miktar: miktar,
              birim: birim,
              lot_no: lot_no,
              kategori: kategori,
              tedarikci: "Excel Toplu Yükleme",
              fatura_no: "EXCEL-TOPLU"
            });
            basariliSayisi++;
          } catch (err) {
            yuklemeHatalari.push(`Satır ${i + 1}: ${err.message}`);
          }
        }
      }
      toast(`${basariliSayisi} satır yüklendi; ${yuklemeHatalari.length} satır yüklenemedi.`, yuklemeHatalari.length > 0);
      if (yuklemeHatalari.length) alert("Yüklenemeyen satırlar:\n" + yuklemeHatalari.slice(0, 20).join("\n") + "\nBaşarılı satırlar kayıtlıdır; dosyanın tamamını tekrar yüklemeyin.");
      renderEnvanter(document.getElementById("viewBody"));
    } catch (hata) {
      alert("Excel dosyası işlenirken hata oluştu: " + hata.message);
    } finally { 
      event.target.value = ''; 
    }
  };
  okuyucu.readAsArrayBuffer(dosya);
}

// ================= STOK GİRİŞİ (ÜT, SKT ve Lot Takipli) =================
async function renderStokGiris(body) {
  const [paraBirimleri, birimler, kategoriler, fatura, stokKartlari, tedarikciler] = await Promise.all([
    api("GET", "/api/ayarlar?tip=para_birimi"),
    api("GET", "/api/ayarlar?tip=birim"),
    api("GET", "/api/ayarlar?tip=kategori"),
    api("GET", "/api/fatura"),
    api("GET", "/api/stok-kartlari"),
    api("GET", "/api/musteri-kartlari")
  ]);

  body.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Yeni Stok Girişi </div>
        <form id="stokGirisForm">
          <div class="form-grid">
            <div class="field">
              <label>Malzeme Kodu</label>
              <input name="malzeme_kodu" id="sg_malzeme_kodu" readonly style="background-color: #e9ecef; color: #6c757d;">
            </div>
            <div class="field">
              <label>Malzeme Adı (Stok Kartı) *</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input name="malzeme_adi" id="sg_malzeme" required list="dl-stokkart" autocomplete="off" placeholder="Kart seçin veya yazın..." style="flex: 1;">
              </div>
              <datalist id="dl-stokkart">
                ${stokKartlari.map(k => `<option value="${escapeHtml(k.malzeme_adi)}">`).join("")}
              </datalist>
            </div>
            <div class="field"><label>Raf Adresi *</label><input name="raf_adresi" required></div>
            <div class="field"><label>Miktar *</label><input name="miktar" type="number" step="any" required></div>
            <div class="field"><label>Birim</label>${selectHtml("birim", birimler)}</div>
            <div class="field"><label>Kategori</label>${selectHtml("kategori", kategoriler, "Kategori Seçin")}</div>
            
            <!-- Kimyasal Ürünler İçin Zorunlu/Kritik Alanlar -->
            <div class="field">
              <label id="lblLot">Lot / Batch Numarası</label>
              <input name="lot_no" id="lotInput" placeholder="Lot no giriniz...">
            </div>
            <div class="field">
              <label id="lblUt">Üretim Tarihi (ÜT)</label>
              <input name="uretim_tarihi" id="utInput" type="date">
            </div>
            <div class="field">
              <label id="lblSkt">Son Kullanma Tarihi (SKT)</label>
              <input name="skt" id="sktInput" type="date">
            </div>

            <div class="field"><label>Fatura No</label><input name="fatura_no"></div>
            <div class="field"><label>Fatura Tarihi</label><input name="fatura_tarihi" type="date"></div>
            <div class="field"><label>Birim Fiyatı</label><input name="birim_fiyati" type="number" step="any"></div>
            <div class="field"><label>Para Birimi</label>${selectHtml("para_birimi", paraBirimleri)}</div>
            <div class="field span-2"><label>Tedarikçi</label>
              <input name="tedarikci" list="dl-tedarikci" autocomplete="off" placeholder="Tedarikçi seçin...">
              <datalist id="dl-tedarikci">
                ${tedarikciler.map(m => `<option value="${escapeHtml(m.musteri_adi)}">`).join("")}
              </datalist>
            </div>
          </div>
          
          <button class="btn btn-primary" style="margin-top:16px" type="submit"> ✅ GİRİŞİ KAYDET </button>
        </form>
      </div>
      <div class="card">
        <div class="section-title">Son Giriş Kayıtları</div>
        <div class="table-wrap">
          <table><thead><tr><th>Malzeme</th><th>Lot No</th><th>Üretim Tarihi</th><th>Son Kullanma Tarihi</th><th>Miktar</th><th>Tedarikçi</th></tr></thead>
          <tbody>${
            // app_2.js içinde renderStokGiris fonksiyonundaki tablo gövdesi:
fatura.slice(0, 15).map(f => `<tr>
  <td>${escapeHtml(f.malzeme_tanim)}</td>
  <td><span class="badge badge-mute">${escapeHtml(f.lot_no || "—")}</span></td>
  <td class="num-cell" style="font-size:11px;">${escapeHtml(f.uretim_tarihi || "—")}</td>
  <td class="num-cell" style="font-size:11px; color: #d9534f; font-weight:bold;">${escapeHtml(f.skt || "—")}</td>
  <td class="num-cell">${f.miktar}</td>
  <td>${escapeHtml(f.tedarikci || "—")}</td>
</tr>`)
          }</tbody></table>
        </div>
      </div>
    </div>`;

  const form = document.getElementById("stokGirisForm");
  const katSelect = form.elements["kategori"];
  const lotInput = document.getElementById("lotInput");
  const utInput = document.getElementById("utInput");
  const sktInput = document.getElementById("sktInput");

  katSelect.addEventListener("change", (e) => {
    const val = e.target.value.toUpperCase();
    if (val.includes("KİMYASAL") || val.includes("BOYA") || val.includes("REÇİNE")) {
      lotInput.required = true;
      utInput.required = true;
      sktInput.required = true;
      document.getElementById("lblLot").innerHTML = "Lot / Batch Numarası <span style='color:red;'>*</span>";
      document.getElementById("lblUt").innerHTML = "Üretim Tarihi (ÜT) <span style='color:red;'>*</span>";
      document.getElementById("lblSkt").innerHTML = "Son Kullanma Tarihi (SKT) <span style='color:red;'>*</span>";
    } else {
      lotInput.required = false;
      utInput.required = false;
      sktInput.required = false;
      document.getElementById("lblLot").textContent = "Lot / Batch Numarası";
      document.getElementById("lblUt").textContent = "Üretim Tarihi (ÜT)";
      document.getElementById("lblSkt").textContent = "Son Kullanma Tarihi (SKT)";
    }
  });

 form.elements["malzeme_adi"].addEventListener("input", async (e) => {
    const secilenAd = e.target.value.trim();
    const bulunanKart = stokKartlari.find(k => k.malzeme_adi === secilenAd);
    
    const birimSelect = form.elements["birim"];
    const kategoriSelect = form.elements["kategori"];

    if (bulunanKart) {
      if (bulunanKart.malzeme_kodu) form.elements["malzeme_kodu"].value = bulunanKart.malzeme_kodu;
      if (bulunanKart.raf_adresi) form.elements["raf_adresi"].value = bulunanKart.raf_adresi;
      
      if (bulunanKart.birim && birimSelect) {
        birimSelect.value = bulunanKart.birim;
      }
      if (bulunanKart.kategori && kategoriSelect) {
        kategoriSelect.value = bulunanKart.kategori;
        kategoriSelect.dispatchEvent(new Event('change'));
      }
    } else {
      try {
        const envanterData = await api("GET", "/api/envanter");
        const envanterUrun = envanterData.find(u => u.malzeme_adi === secilenAd);
        if (envanterUrun) {
          if (envanterUrun.malzeme_kodu) form.elements["malzeme_kodu"].value = envanterUrun.malzeme_kodu;
          if (envanterUrun.raf_adresi) form.elements["raf_adresi"].value = envanterUrun.raf_adresi;
          
          if (envanterUrun.birim && birimSelect) {
            birimSelect.value = envanterUrun.birim;
          }
          if (envanterUrun.kategori && kategoriSelect) {
            kategoriSelect.value = envanterUrun.kategori;
            kategoriSelect.dispatchEvent(new Event('change'));
          }
        }
      } catch (err) {}
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/stok-giris", Object.fromEntries(new FormData(e.target).entries()));
      toast(r.message);
      renderStokGiris(body);
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ================= STOK ÇIKIŞI (Lot, ÜT ve SKT Seçimli) =================
async function renderStokCikis(body) {
  const isYonetici = state.role === "yonetici";
  const [envanter, tekneler, personel, musteriler] = await Promise.all([
    api("GET", "/api/envanter"),
    api("GET", "/api/ayarlar?tip=tekne"),
    api("GET", "/api/ayarlar?tip=personel"),
    api("GET", "/api/musteri-kartlari")
  ]);
  const cikislar = await api("GET", "/api/cikislar");
  const aktifStoklar = envanter.filter(e => e.miktar > 0);

  body.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Stoktan Düşüm Yap (Lot, ÜT & SKT Seçimi)</div>
        <form id="cikisForm">
          <div class="form-grid">
            <div class="field span-2">
              <label>Malzeme *</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input name="malzeme_adi" id="cikisMalzeme" list="dl-cikis-malzeme" required autocomplete="off" placeholder="Ürün adını yazmaya başlayın..." style="flex: 1;">
                <button type="button" class="btn-barkod" onclick="barkodKamerasiAc('cikisMalzeme', 'envanter')" title="Barkod / QR Okut">📷</button>
              </div>
              <datalist id="dl-cikis-malzeme">
                ${[...new Set(aktifStoklar.map((e) => e.malzeme_adi))].map((ad) => `<option value="${escapeHtml(ad)}">`).join("")}
              </datalist>
            </div>
            
            <div class="field span-2">
              <label>Çıkış Yapılacak Lot / ÜT / SKT Seçeneği *</label>
              <select name="envanter_id" id="cikisLot" disabled required style="background-color: #fdf1ea; font-weight: bold;">
                <option value="">Önce ürün seçiniz...</option>
              </select>
            </div>
            
            <div class="field">
              <label>Raf Adresi</label>
              <input type="text" name="raf_adresi" id="cikisRaf" readonly style="background-color: #e9ecef;">
            </div>
            
            <div class="field">
              <label>Çıkış Miktarı *</label>
              <input name="miktar" id="cikisMiktar" type="number" step="any" required disabled>
            </div>
            <div class="field"><label>Tekne No / Proje / Müşteri</label>
              <input name="tekne_no" list="dl-musteriler" autocomplete="off" placeholder="Müşteri/Tekne seçin">
              <datalist id="dl-musteriler">
                ${musteriler.map(m => `<option value="${escapeHtml(m.musteri_adi)}">`).join("")}
                ${tekneler.map(t => `<option value="${escapeHtml(t.deger)}">`).join("")}
              </datalist>
            </div>
            <div class="field span-2"><label>Teslim Edilen Kişi</label>${selectHtml("teslim_edilen", personel)}</div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px" type="submit"> ✅ ÇIKIŞI KAYDET</button>
        </form>
      </div>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div class="section-title" style="margin-bottom: 0;">Çıkış Geçmişi</div>
          <button onclick="exceleAktar()" style="background-color: #107c41; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px;">
            📥 Excel'e Aktar
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Malzeme</th>
                <th>Lot No</th>
                <th>Üretim Tarihi</th>
                <th>Son Kullanma Tarihi</th>
                <th>Miktar</th>
                <th>Tekne/Proje</th>
                <th>Teslim Alan</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${
              cikislar
                .slice(0, 20)
                .map(
                  (c) => `<tr>
              <td>${escapeHtml(c.malzeme_tanim)}</td>
              <td><span class="badge badge-mute">${escapeHtml(c.lot_no || "—")}</span></td>
              <td class="mono" style="font-size:11px;">${escapeHtml(c.uretim_tarihi || "—")}</td>
              <td class="mono" style="font-size:11px; color: #d9534f; font-weight:bold;">${escapeHtml(c.skt || "—")}</td>
              <td class="num-cell" style="font-weight:bold;">${c.miktar}</td>
              <td class="mono">${escapeHtml(c.tekne_no || "—")}</td>
              <td>${escapeHtml(c.teslim_edilen || "—")}</td>
              <td>${c.iptal ? '<span class="badge badge-danger">İptal</span>' : '<span class="badge badge-ok">Aktif</span>'}</td>
              <td>${c.iptal ? "" : `${isYonetici ? `<button class="btn btn-sm btn-danger-outline" data-cikis-iptal="${c.id}">İptal Et</button>` : ''}`}</td>
            </tr>`
                )
                .join("") ||
              `<tr><td colspan="9"><div class="empty-state">Kayıt yok.</div></td></tr>`
            }</tbody>
          </table>
        </div>
      </div>
    </div>`;

  document.getElementById("cikisMalzeme").addEventListener("input", (e) => {
    const arananAd = e.target.value.trim();
    const bulunanUrunler = aktifStoklar.filter(urun => urun.malzeme_adi === arananAd);
    const lotSelect = document.getElementById("cikisLot");
    const rafInput = document.getElementById("cikisRaf");
    const miktarInput = document.getElementById("cikisMiktar");

    if (bulunanUrunler.length > 0) {
      lotSelect.disabled = false;
      lotSelect.style.backgroundColor = "#fdf1ea";
      lotSelect.innerHTML = '<option value="">Lütfen kullanılacak Lot / ÜT / SKT seçin...</option>' + 
        bulunanUrunler.map(u => {
          let lotDurum = u.lot_no ? `Lot: ${u.lot_no}` : "Lot Yok";
          let utDurum = u.uretim_tarihi ? `ÜT: ${u.uretim_tarihi}` : "";
          let sktDurum = u.skt ? `SKT: ${u.skt}` : "";
          let tarihDetay = [utDurum, sktDurum].filter(Boolean).join(" | ");
          if (tarihDetay) tarihDetay = ` | ${tarihDetay}`;
          
          return `<option value="${u.id}" data-raf="${escapeHtml(u.raf_adresi||'Genel Depo')}" data-max="${u.miktar}">
            [${lotDurum}${tarihDetay}] - Raf: ${escapeHtml(u.raf_adresi||'Genel Depo')} (Kalan: ${u.miktar})
          </option>`;
        }).join("");
      
      rafInput.value = "";
      miktarInput.value = "";
      miktarInput.disabled = true;
    } else {
      lotSelect.innerHTML = '<option value="">Önce ürün seçiniz...</option>';
      lotSelect.disabled = true;
      rafInput.value = "";
      miktarInput.disabled = true;
    }
  });

  document.getElementById("cikisLot").addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const maxStok = selectedOption.getAttribute("data-max");
    const rafAdr = selectedOption.getAttribute("data-raf");
    
    const rafInput = document.getElementById("cikisRaf");
    const miktarInput = document.getElementById("cikisMiktar");
    
    if (maxStok) {
      rafInput.value = rafAdr || "";
      miktarInput.disabled = false;
      miktarInput.placeholder = `Maks: ${maxStok}`;
      miktarInput.max = maxStok;
      miktarInput.value = ""; 
    }
  });

  document.getElementById("cikisForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/stok-cikis", Object.fromEntries(new FormData(e.target).entries()));
      toast(r.message);
      renderStokCikis(body);
    } catch (err) {
      toast(err.message, true);
    }
  });



  body.querySelectorAll("[data-cikis-iptal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cikisId = btn.dataset.cikisIptal;
      const eski = document.getElementById("ozelModal");
      if (eski) eski.remove();

      const modalHtml = `
        <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
          <div style="background: white; padding: 24px; border-radius: 8px; width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
            <h3 style="margin-top: 0; color: #333; font-size: 18px;">Stok Çıkış İptali</h3>
            <p style="color: #666; font-size: 13px; line-height: 1.4;">Bu stok çıkışını iptal etmek istediğinize emin misiniz? Harcanan miktar depoya geri eklenecektir.</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
              <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer;">Evet, İptal Et</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);
      document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();
      document.getElementById("modalOnay").onclick = async () => {
        document.getElementById("ozelModal").remove();
        try {
          const r = await api("POST", `/api/cikislar/${cikisId}/iptal`);
          toast(r.message);
          renderStokCikis(body);
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  });
}

// ================= YENİ TALEP OLUŞTURMA EKRANI =================
let manuelTalepler = [];

async function renderTalepOlustur(body) {
  const [envanterListesi, birimler, stokKartlari] = await Promise.all([
    api("GET", "/api/envanter"),
    api("GET", "/api/ayarlar?tip=birim"),
    api("GET", "/api/stok-kartlari")
  ]);

  body.innerHTML = `
    <div class="card" style="margin-bottom: 16px; background-color: #f4f6f8; border: 1px solid #d1d5db;">
      <div class="section-title" style="margin-bottom: 12px; color: #1a365d;">Envanter Dışı Yeni Ürün Ekle (Sadece Bu Talep İçin)</div>
      <div style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 3; min-width: 200px;">
          <label style="font-size: 12px; font-weight: bold; color: #4b5563; margin-bottom: 4px; display: block;">Malzeme Adı</label>
          <input type="text" id="yeniTalepAd" placeholder="Örn: Malzeme ismi yazın" list="dl-stokkart-talep" style="width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
          <datalist id="dl-stokkart-talep">
            ${stokKartlari.map(k => `<option value="${escapeHtml(k.malzeme_adi)}">`).join("")}
          </datalist>
        </div>
        <div style="flex: 1; min-width: 100px;">
          <label style="font-size: 12px; font-weight: bold; color: #4b5563; margin-bottom: 4px; display: block;">Talep Miktarı</label>
          <input type="number" id="yeniTalepMiktar" value="1" min="1" style="width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
        </div>
        <div style="flex: 1; min-width: 120px;">
          <label style="font-size: 12px; font-weight: bold; color: #4b5563; margin-bottom: 4px; display: block;">Birim</label>
          ${selectHtml("yeniTalepBirim", birimler).replace('<select', '<select id="yeniTalepBirim" style="width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"')}
        </div>
        <button id="btnManuelEkle" style="background-color: #2b579a; color: white; border: none; padding: 0 20px; border-radius: 4px; font-weight: bold; cursor: pointer; height: 38px; display: flex; align-items: center; gap: 6px;">
          ➕ Listeye Ekle
        </button>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div class="section-title" style="margin-bottom: 0;">Envanterden Seç ve Talep Grubunu Onayla</div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="talepAramaInput" placeholder="🔍 Envanterde Ara (Kod, Ad, Raf)..." style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; width: 260px; font-size: 13px;">
          <button id="talepGonderBtn" style="background-color: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            🛒 Seçili Ürünlerle Talep Grubunu Oluştur
          </button>
        </div>
      </div>
      
      <div class="table-wrap">
        <table id="talepTablo">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllTalep"></th>
              <th>Tür</th>
              <th>Malzeme Kodu</th>
              <th>Malzeme Adı</th>
              <th>Raf</th>
              <th>Stok</th>
              <th style="width: 110px;">Talep Miktarı</th>
              <th>Birim</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody id="talepTbody">
          </tbody>
        </table>
      </div>
    </div>
  `;

  window.manuelTalepSil = (index) => {
     state.secilenKritikUrunler.delete(`manuel_${index}`);
     manuelTalepler[index].deleted = true;
     toast("Envanter dışı eklenen ürün listeden çıkarıldı.");
     renderTable(document.getElementById("talepAramaInput").value);
  };

  function renderTable(aranan = "") {
    const tbody = document.getElementById("talepTbody");
    if (!tbody) return;
    let html = "";

    manuelTalepler.forEach((item, index) => {
      if (item.deleted) return;
      const isChecked = state.secilenKritikUrunler.has(`manuel_${index}`) ? 'checked' : '';
      html += `
        <tr style="background-color: #fff3cd;">
          <td style="text-align: center;"><input type="checkbox" class="talep-chk" value="manuel_${index}" ${isChecked}></td>
          <td><span class="badge badge-warn" style="font-size:10px;">Yeni / Dışı</span></td>
          <td class="mono">—</td>
          <td><b>${escapeHtml(item.ad)}</b></td>
          <td>—</td>
          <td class="num-cell">—</td>
          <td>
            <input type="number" class="talep-miktar" data-id="manuel_${index}" value="${item.miktar}" min="1" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
          </td>
          <td>${escapeHtml(item.birim)}</td>
          <td><button class="btn btn-sm btn-danger-outline" style="padding: 2px 6px;" onclick="manuelTalepSil(${index})">Sil</button></td>
        </tr>
      `;
    });

    const filtrelenmisListe = envanterListesi.filter(r => {
      const kod = String(r.malzeme_kodu || "").toLocaleLowerCase("tr-TR");
      const ad = String(r.malzeme_adi || "").toLocaleLowerCase("tr-TR");
      const raf = String(r.raf_adresi || "").toLocaleLowerCase("tr-TR");
      return !aranan || kod.includes(aranan) || ad.includes(aranan) || raf.includes(aranan);
    });

    html += filtrelenmisListe.map(r => {
      const isChecked = state.secilenKritikUrunler.has(String(r.id)) ? 'checked' : '';
      const onerilenMiktar = r.miktar <= 5 ? (20 - r.miktar > 0 ? 20 - r.miktar : 1) : 1;
      return `
        <tr>
          <td style="text-align: center;"><input type="checkbox" class="talep-chk" value="${r.id}" ${isChecked}></td>
          <td><span class="badge badge-ok" style="font-size:10px;">Stok Kartı</span></td>
          <td class="mono">${escapeHtml(r.malzeme_kodu || "—")}</td>
          <td>${escapeHtml(r.malzeme_adi)}</td>
          <td>${escapeHtml(r.raf_adresi || "—")}</td>
          <td class="num-cell" style="color: ${r.miktar <= 5 ? '#d9534f' : '#333'}; font-weight: bold;">${r.miktar}</td>
          <td>
            <input type="number" class="talep-miktar" data-id="${r.id}" value="${onerilenMiktar}" min="1" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
          </td>
          <td>${escapeHtml(r.birim || "—")}</td>
          <td></td>
        </tr>
      `;
    }).join("");

    if (!html) html = '<tr><td colspan="9"><div class="empty-state">Görüntülenecek ürün bulunamadı.</div></td></tr>';
    tbody.innerHTML = html;

    document.querySelectorAll(".talep-chk").forEach(chk => {
      chk.onchange = (e) => {
        if (e.target.checked) state.secilenKritikUrunler.add(e.target.value);
        else state.secilenKritikUrunler.delete(e.target.value);
      };
    });
  }

  renderTable();

  document.getElementById("talepAramaInput").addEventListener("input", (e) => renderTable(e.target.value));

  document.getElementById("selectAllTalep").addEventListener("change", (e) => {
    document.querySelectorAll(".talep-chk").forEach(chk => {
      chk.checked = e.target.checked;
      if (e.target.checked) state.secilenKritikUrunler.add(chk.value);
      else state.secilenKritikUrunler.delete(chk.value);
    });
  });

  document.getElementById("yeniTalepAd").addEventListener("input", (e) => {
     const ad = e.target.value.trim();
     const kart = stokKartlari.find(k => k.malzeme_adi === ad);
     if(kart) {
       document.getElementById("yeniTalepBirim").value = kart.birim || "Adet";
     }
  });

  document.getElementById("btnManuelEkle").addEventListener("click", () => {
    const adInput = document.getElementById("yeniTalepAd");
    const miktarInput = document.getElementById("yeniTalepMiktar");
    const birimInput = document.getElementById("yeniTalepBirim");

    const ad = adInput.value.trim();
    const miktar = parseInt(miktarInput.value) || 1;
    const birim = birimInput.value;

    if (!ad) { toast("Lütfen malzeme adını girin!", true); return; }
    if (!birim) { toast("Lütfen birim seçin!", true); return; }

    const yeniIndex = manuelTalepler.length;
    manuelTalepler.push({ ad, miktar, birim, deleted: false });
    state.secilenKritikUrunler.add(`manuel_${yeniIndex}`);

    adInput.value = "";
    miktarInput.value = "1";
    toast("Envanter dışı ürün listeye eklendi ve seçildi.");
    renderTable(document.getElementById("talepAramaInput").value);
  });

  document.getElementById("talepGonderBtn").addEventListener("click", () => {
    const rawUrunler = Array.from(state.secilenKritikUrunler);
    
    let gecerliUrunVarMi = false;
    for (let val of rawUrunler) {
      const mInput = document.querySelector(`.talep-miktar[data-id="${val}"]`);
      if (mInput && parseFloat(mInput.value) > 0) {
         gecerliUrunVarMi = true;
         break;
      }
    }

    if (!gecerliUrunVarMi) {
      toast("Lütfen talep oluşturmak için en az bir ürün seçin ve miktar girin!", true);
      return;
    }

    Swal.fire({
      title: 'Talep Grubunu İsimlendir ve Termin Belirle',
      html: `
        <div style="text-align: left; margin-bottom: 10px;">
          <label style="font-size: 12px; font-weight: bold; color: #555;">Grup Adı:</label>
          <input type="text" id="grupAdiInput" class="swal2-input" value="Talep - ${new Date().toLocaleDateString('tr-TR')}" style="width: 100%; margin: 5px 0 15px 0;">
          
          <label style="font-size: 12px; font-weight: bold; color: #555;">Termin Tarihi (İstenen Tarih):</label>
          <input type="date" id="terminTarihiInput" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Talebi Oluştur',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#28a745',
      reverseButtons: true,
      preConfirm: () => {
        return {
          grupAdi: document.getElementById('grupAdiInput').value.trim() || "Genel Satın Alma",
          terminTarihi: document.getElementById('terminTarihiInput').value || null
        };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { grupAdi, terminTarihi } = result.value;
        try {
          toast("Ürünler hazırlanıyor, lütfen bekleyin...");
          let envanterGuncellendi = false;

          for (let val of rawUrunler) {
            if (String(val).startsWith("manuel_")) {
              const idx = parseInt(String(val).split("_")[1]);
              const mItem = manuelTalepler[idx];
              if (!mItem || mItem.deleted) continue;

              const kartBulundu = stokKartlari.find(k => k.malzeme_adi === mItem.ad);
              const mKod = kartBulundu ? (kartBulundu.malzeme_kodu || "YENI-"+Math.floor(Math.random()*1000)) : "YENI-" + Math.floor(Math.random() * 10000);

              try {
                await api("POST", "/api/stok-giris", {
                  malzeme_kodu: mKod,
                  malzeme_adi: mItem.ad,
                  raf_adresi: "Sipariş Bekliyor",
                  miktar: 0, 
                  birim: mItem.birim,
                  tedarikci: "Talep Üzerine Eklendi",
                  fatura_no: "TALEP-DISI"
                });
                envanterGuncellendi = true;
              } catch (e) {
                try {
                  await api("POST", "/api/stok-giris", {
                    malzeme_kodu: mKod,
                    malzeme_adi: mItem.ad,
                    raf_adresi: "Sipariş Bekliyor",
                    miktar: 0.001,
                    birim: mItem.birim,
                    tedarikci: "Talep Üzerine Eklendi",
                    fatura_no: "TALEP-DISI"
                  });
                  envanterGuncellendi = true;
                } catch (e2) {}
              }
            }
          }

          let guncelEnvanter = [];
          if (envanterGuncellendi) {
             guncelEnvanter = await api("GET", "/api/envanter");
          }

          const seciliUrunler = [];
          for (let val of rawUrunler) {
            const miktarInput = document.querySelector(`.talep-miktar[data-id="${val}"]`);
            const siparisMiktari = miktarInput ? parseFloat(miktarInput.value) || 0 : 0;
            
            if (siparisMiktari <= 0) continue;

            if (String(val).startsWith("manuel_")) {
              const idx = parseInt(String(val).split("_")[1]);
              const mItem = manuelTalepler[idx];
              if (!mItem || mItem.deleted) continue;

              const found = guncelEnvanter.find(e => e.malzeme_adi === mItem.ad);
              if (found) {
                seciliUrunler.push({ id: found.id, siparisMiktari, termin_tarihi: terminTarihi });
              } else {
                seciliUrunler.push({
                  id: null,
                  malzeme_kodu: "YENI",
                  malzeme_adi: mItem.ad,
                  birim: mItem.birim,
                  siparisMiktari: siparisMiktari,
                  termin_tarihi: terminTarihi
                });
              }
            } else {
              seciliUrunler.push({ id: val, siparisMiktari, termin_tarihi: terminTarihi });
            }
          }

          if (seciliUrunler.length === 0) {
            toast("Gönderilecek geçerli ürün bulunamadı!", true);
            return;
          }

          const res = await api("POST", "/api/satinalma/talep-olustur", { seciliUrunler, grup_adi: grupAdi, termin_tarihi: terminTarihi });
          toast(res.message || "Talep grubu başarıyla oluşturuldu!");
          
          state.secilenKritikUrunler.clear();
          manuelTalepler = [];
          
          document.querySelector('[data-view="satinalma"]').click();
        } catch (err) {
          toast(err.message, true);
        }
      }
    });
  });
}

// Yardımcı Tablo Doldurma (Fatura / Kayıt Kopyalama / Düzenleme Listesi İçin Yedek Fonksiyon)
function tabloyuDoldur(faturaListesi) {
  const tbody = document.getElementById('faturaTbody');
  if (!tbody) return;
  if (!faturaListesi || !faturaListesi.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Kayıt yok.</div></td></tr>';
    return;
  }

  tbody.innerHTML = faturaListesi.slice(0, 15).map(f => {
    const safeAttr = escapeHtml(JSON.stringify(f)).replace(/'/g, '&#39;');
    return '<tr>' +
      '<td><b>' + escapeHtml(f.malzeme_tanim) + '</b></td>' +
      '<td><span class="badge badge-mute">' + escapeHtml(f.lot_no || '—') + '</span></td>' +
      '<td class="mono" style="font-size:11px;">' + escapeHtml(f.uretim_tarihi || '—') + '</td>' +
      '<td class="mono" style="font-size:11px; color: #d9534f; font-weight:bold;">' + escapeHtml(f.skt || '—') + '</td>' +
      '<td class="num-cell" style="font-weight:bold;">' + escapeHtml(String(f.miktar || 0)) + '</td>' +
      '<td>' + escapeHtml(f.tedarikci || '—') + '</td>' +
      '<td style="text-align: right; white-space: nowrap;">' +
        '<button type="button" class="btn btn-sm btn-kopya" style="background-color: #f0ad4e; color: #fff; margin-right: 4px;" data-record="' + safeAttr + '" title="Bu kaydı kopyala">Kopyala</button>' +
        '<button type="button" class="btn btn-sm btn-duzenle" style="background-color: #0275d8; color: #fff;" data-record="' + safeAttr + '" title="Düzenle">Düzenle</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}
// ================= SATIN ALMA TALEPLERİ =================
async function renderSatinalma(body) {
  const isPersonel = state.role === "personel";
  let talepler = [];
  let envanterListesi = [];
  try {
    const [talepRes, envanterRes] = await Promise.all([
      api("GET", "/api/satinalma/talepler"),
      api("GET", "/api/envanter")
    ]);
    talepler = talepRes || [];
    envanterListesi = envanterRes || [];
  } catch(e) {}

  talepler.forEach(t => {
    const dStr = String(t.durum || "").trim().toLowerCase();
    const onayliMi = (dStr.includes('onay') || dStr.includes('tamam')) && !dStr.includes('bekliyor') && !dStr.includes('yönetici onayı bekliyor');
    
    if (!onayliMi) {
      t.durum = "Bekliyor";
    }
  });

  const devamEdenListesi = [];
  const bekleyenListesi = [];
  const tamamlananListesi = [];
  const reddedilenListesi = [];
  
  talepler.forEach(t => {
    const talepMiktari = num(t.talep_miktari);
    const gelenMiktar = num(t.gelen_miktar);
    const durum = String(t.durum || "").trim().toLowerCase();
    
    const redSebebiVarMi = t.red_sebebi && String(t.red_sebebi).trim() !== "";
    const gercektenOnayliMi = (durum.includes('onay') || durum.includes('tamam')) && !durum.includes('bekliyor') && !durum.includes('yönetici onayı bekliyor');

    if (durum.includes('red') || durum.includes('iptal') || redSebebiVarMi) {
      reddedilenListesi.push(t);
    } 
    else if (!gercektenOnayliMi || durum.includes('bekliyor') || durum === '') {
      bekleyenListesi.push(t);
    } 
    else if (gercektenOnayliMi && gelenMiktar >= talepMiktari && talepMiktari > 0) {
      tamamlananListesi.push(t);
    } 
    else {
      devamEdenListesi.push(t);
    }
  });

  let aktifZamanliSekme = localStorage.getItem("satinalmaSekme");
  if (!aktifZamanliSekme) {
    if (bekleyenListesi.length > 0) {
      aktifZamanliSekme = "bekleyen";
    } else {
      aktifZamanliSekme = "devam";
    }
  }

  body.innerHTML = `
    <div class="card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div class="section-title" style="margin-bottom: 0;">Satın Alma İşlemleri Talep Grupları ve Sevkiyat Takibi</div>
        <button onclick="exceleAktar()" style="background-color: #107c41; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          📥 Listeleri Excel'e Aktar
        </button>
      </div>
    </div>

    <div class="tabs" style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
      <button class="tab-btn ${aktifZamanliSekme === 'devam' ? 'active' : ''}" onclick="satinalmaSekmeDegis('devam')">🚚 Devam Eden / Yoldakiler (${devamEdenListesi.length})</button>
      <button class="tab-btn ${aktifZamanliSekme === 'bekleyen' ? 'active' : ''}" onclick="satinalmaSekmeDegis('bekleyen')">⏳ Onay Bekleyenler (${bekleyenListesi.length})</button>
      <button class="tab-btn ${aktifZamanliSekme === 'tamamlanan' ? 'active' : ''}" onclick="satinalmaSekmeDegis('tamamlanan')">✅ Tamamlananlar (${tamamlananListesi.length})</button>
      <button class="tab-btn ${aktifZamanliSekme === 'reddedilen' ? 'active' : ''}" onclick="satinalmaSekmeDegis('reddedilen')">❌ Reddedilenler (${reddedilenListesi.length})</button>
    </div>
    
    <div id="satinalmaListeKapsayici">
      ${renderUrunBazliGrupHTML(
        aktifZamanliSekme === 'devam' ? devamEdenListesi : 
        aktifZamanliSekme === 'bekleyen' ? bekleyenListesi : 
        aktifZamanliSekme === 'tamamlanan' ? tamamlananListesi : reddedilenListesi, 
        isPersonel,
        envanterListesi,
        aktifZamanliSekme === 'reddedilen'
      )}
    </div>
  `;
}

function satinalmaSekmeDegis(sekmeAdi) {
  localStorage.setItem("satinalmaSekme", sekmeAdi);
  renderSatinalma(document.getElementById("viewBody"));
}

function renderUrunBazliGrupHTML(liste, isPersonel, envanterListesi = [], isReddedilenSekmesi = false) {
  if (!liste || liste.length === 0) {
    return `<div class="card"><div class="empty-state">Bu kategoride gösterilecek ürün bulunmuyor.</div></div>`;
  }

  const isSatinalmaYetkilisiOrYonetici = state.role === "satinalma" || state.role === "yonetici";
  const sonAcikGrup = localStorage.getItem("sonAcikGrup");

  const gruplarObj = {};
  liste.forEach(t => {
    const gAd = t.grup_adi || "Genel Satın Alma";
    if (!gruplarObj[gAd]) gruplarObj[gAd] = [];
    gruplarObj[gAd].push(t);
  });

  return Object.keys(gruplarObj).map((grupAdi, index) => {
    const gListe = gruplarObj[grupAdi];
    const toplamKalem = gListe.length;
    const isAcik = sonAcikGrup === grupAdi;
    
    return `
      <div class="card grup-kart" style="margin-bottom: 12px; padding: 0; overflow: hidden; border: 1px solid #ddd;">
        <div class="grup-header" onclick="grupAcKapat(${index}, '${escapeHtml(grupAdi)}')" style="background: #f8f9fa; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="ikon-${index}" style="font-size: 16px; font-weight: bold; transition: transform 0.2s; ${isAcik ? 'transform: rotate(90deg);' : ''}">▶</span>
            <h3 style="margin: 0; font-size: 16px; color: #1a365d;">📁 ${escapeHtml(grupAdi)}</h3>
            <span style="background: #e2e8f0; color: #333; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">${toplamKalem} Kalem Ürün</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
            ${!isPersonel ? `
              <button class="btn btn-sm" style="background-color: #6c757d; color: white; border: none; padding: 5px 10px; font-size: 11px; border-radius: 4px; cursor: pointer;" onclick="grupSilModalAc('${escapeHtml(grupAdi)}')">🔥 Grubu Komple Sil</button>
            ` : ''}
            ${!isReddedilenSekmesi ? `
              <button class="btn btn-sm" style="background-color: #0056b3; color: white; border: none; padding: 5px 10px; font-size: 11px; border-radius: 4px; cursor: pointer;" onclick="grupSecilenleriPdf(${index}, '${escapeHtml(grupAdi)}')">📄 Seçilenleri PDF Yap</button>
            ` : `<span style="font-size: 12px; color: #d9534f; font-weight: bold;">Reddedilen Ürünler</span>`}
          </div>
        </div>

        <div id="icerik-${index}" data-grupname="${escapeHtml(grupAdi)}" style="display: ${isAcik ? 'block' : 'none'}; padding: 15px; border-top: 1px solid #ddd; background: #fff;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width: 30px; text-align: center;">
                    <input type="checkbox" onchange="const chks = document.querySelectorAll('#icerik-${index} .grup-chk'); chks.forEach(c => c.checked = this.checked);">
                  </th>
                  <th>Malzeme Kodu</th>
                  <th>Malzeme Adı</th>
                  ${!isReddedilenSekmesi ? '<th>Depodaki Stok</th>' : ''}
                  <th>Talep Miktarı</th>
                  ${!isReddedilenSekmesi ? '<th>Gelen / Kalan</th>' : ''}
                  <th>Birim</th>
                  <th>Talep Eden</th>
                  <th>Tarih</th>
                  <th>Termin Tarihi</th>
                  <th>Durum / Red Nedeni</th>
                  <th style="text-align: right;">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                ${
                  gListe.map(t => {
                    const talepMiktari = num(t.talep_miktari);
                    const gelenMiktar = num(t.gelen_miktar);
                    const kalanMiktar = talepMiktari - gelenMiktar;
                    
                    const stokBulunan = envanterListesi.find(e => e.malzeme_adi === t.malzeme_adi);
                    const depodakiMiktar = stokBulunan ? stokBulunan.miktar : 0;
                    
                    let durumBadge = '<span class="badge badge-warn">Bekliyor</span>';
                    const durumStr = String(t.durum || "").trim().toLowerCase();
                    const redSebebiVarMi = t.red_sebebi && String(t.red_sebebi).trim() !== "";
                    
                    const gercektenOnayliMi = (durumStr.includes('onay') || durumStr.includes('tamam')) && !durumStr.includes('bekliyor') && !durumStr.includes('yönetici onayı bekliyor');

                    if (durumStr.includes('red') || durumStr.includes('iptal') || redSebebiVarMi) {
                      durumBadge = '<span class="badge badge-danger">Reddedildi</span>';
                    } 
                    else if (!gercektenOnayliMi) {
                      if (durumStr.includes('satın alma onayladı') || durumStr.includes('satin alma onayladi')) {
                        durumBadge = '<span class="badge" style="background-color: #f0ad4e; color: white;">Yönetici Onayı Bekliyor</span>';
                      } else {
                        durumBadge = '<span class="badge badge-warn">Bekliyor</span>';
                      }
                    } 
                    else if (gercektenOnayliMi && gelenMiktar >= talepMiktari && talepMiktari > 0) {
                      durumBadge = '<span class="badge badge-ok">Tamamlandı</span>';
                    } 
                    else if (gelenMiktar > 0 && gelenMiktar < talepMiktari) {
                      durumBadge = '<span class="badge" style="background-color: #17a2b8; color: white;">Kısmi Geldi</span>';
                    } else {
                      durumBadge = '<span class="badge badge-ok">Onaylandı</span>';
                    }
                    
                    const redAciklamasi = t.red_sebebi ? `<div style="font-size: 12px; color: #d9534f; margin-top: 4px; font-weight: bold;">Red Nedeni: ${escapeHtml(t.red_sebebi)}</div>` : '';

                    return `
                    <tr>
                      <td style="text-align: center;" onclick="event.stopPropagation()">
                        <input type="checkbox" class="grup-chk" data-id="${t.id}" data-ad="${escapeHtml(t.malzeme_adi)}" data-miktar="${talepMiktari}" data-birim="${escapeHtml(t.birim || "Adet")}">
                      </td>
                      <td class="mono">${escapeHtml(t.malzeme_kodu || "—")}</td>
                      <td><b>${escapeHtml(t.malzeme_adi)}</b></td>
                      ${!isReddedilenSekmesi ? `
                        <td class="num-cell" style="font-size: 13px;">
                          ${depodakiMiktar > 0 
                            ? `<span style="background-color: #e6ffed; color: #28a745; padding: 2px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #28a745;">${depodakiMiktar}</span>` 
                            : `<span style="background-color: #fdf1ea; color: #d9534f; padding: 2px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #d9534f;">0</span>`}
                        </td>
                      ` : ''}
                      <td class="num-cell" style="font-weight: bold; color: #0275d8;">${talepMiktari}</td>
                      ${!isReddedilenSekmesi ? `
                        <td class="num-cell">
                          <span style="color: #28a745; font-weight: bold;" title="Depoya Gelen">${gelenMiktar}</span> / 
                          <span style="color: ${kalanMiktar > 0 ? '#d9534f' : '#6c757d'}; font-weight: bold;" title="Yolda / Kalan">${kalanMiktar > 0 ? kalanMiktar + ' Yolda' : 'Tamam'}</span>
                        </td>
                      ` : ''}
                      <td>${escapeHtml(t.birim || "Adet")}</td>
                      <td>${escapeHtml(t.talep_eden)}</td>
                      <td class="mono" style="font-size: 11px;">${escapeHtml(t.created_at || "—")}</td>
                      <td class="mono" style="font-size: 11px; font-weight: bold; color: #d9534f;">${formatTermin(t.termin_tarihi)}</td>
                      <td>
                        ${durumBadge}
                        ${redAciklamasi}
                      </td>
                      <td style="text-align: right; white-space: nowrap;">
                        ${!isReddedilenSekmesi ? `
                          ${isSatinalmaYetkilisiOrYonetici ? `
                            <button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" onclick="tekliflerModalAc(${t.id}, '${escapeHtml(t.malzeme_adi)}', ${talepMiktari}, '${escapeHtml(t.birim || "Adet")}')">🤝 Teklifler</button>
                          ` : ''}
                          
                          <button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #f0ad4e; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" onclick="satinAlmaDuzenleModal(${t.id}, '${escapeHtml(t.malzeme_adi)}', ${talepMiktari}, '${escapeHtml(t.termin_tarihi || '')}')">Düzenle</button>
                          
                          ${(durumStr === 'bekliyor') && state.role === 'satinalma' ? `
                            <button class="btn btn-sm" style="background-color: #17a2b8; color: white; border: none; padding: 4px 8px; font-size: 11px; margin-right: 4px; border-radius: 3px; cursor: pointer;" onclick="satinAlmaOnayla(${t.id}, '${escapeHtml(grupAdi)}')">📋 S.A. Onayla</button>
                            <button class="btn btn-sm" style="background-color: #d9534f; color: white; border: none; padding: 4px 8px; font-size: 11px; margin-right: 4px; border-radius: 3px; cursor: pointer;" onclick="satinAlmaReddet(${t.id})">❌ Reddet</button>
                          ` : (durumStr.includes('satın alma onayladı') || durumStr.includes('satın alma onayladi')) ? `
                            ${state.role === 'yonetici' ? `
                              <button class="btn btn-sm" style="background-color: #28a745; color: white; border: none; padding: 4px 8px; font-size: 11px; margin-right: 4px; border-radius: 3px; cursor: pointer;" onclick="satinAlmaOnayla(${t.id}, '${escapeHtml(grupAdi)}')">Yönetici Onayı Ver</button>
                              <button class="btn btn-sm" style="background-color: #d9534f; color: white; border: none; padding: 4px 8px; font-size: 11px; margin-right: 4px; border-radius: 3px; cursor: pointer;" onclick="satinAlmaReddet(${t.id})">❌ Reddet</button>
                            ` : `<span style="font-size: 11px; color: #f0ad4e; font-weight: bold; margin-right: 4px;">⏳ Yönetici Onayı Bekliyor</span>`}
                          ` : ''}
                        ` : ''}
                        ${!isPersonel ? `<button class="btn s-btn btn-sm btn-danger-outline" style="padding: 4px 8px; font-size: 11px;" onclick="satinAlmaSil(${t.id})">Sil</button>` : ''}
                      </td>
                    </tr>
                  `;}).join("")
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function grupSilModalAc(grupAdi) {
  let modalOverlay = document.getElementById("ozelModalOverlay");
  if (!modalOverlay) {
    modalOverlay = document.createElement("div");
    modalOverlay.id = "ozelModalOverlay";
    modalOverlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;";
    document.body.appendChild(modalOverlay);
  }

  modalOverlay.innerHTML = `
    <div style="background:white; padding:25px; border-radius:8px; width:400px; max-width:90%; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
      <h3 style="margin-top:0; color:#d9534f; font-size:18px;">⚠️ Grubu Sil</h3>
      <p style="color:#333; font-size:14px; line-height:1.5;">
        <b>"${escapeHtml(grupAdi)}"</b> grubuna ait TÜM talepler kalıcı olarak silinecektir. Devam etmek istiyor musunuz?
      </p>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button class="btn" style="background:#6c757d; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;" onclick="document.getElementById('ozelModalOverlay').remove()">Vazgeç</button>
        <button class="btn" style="background:#d9534f; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;" onclick="grupKompleSilOnay('${escapeHtml(grupAdi)}')">Evet, Sil</button>
      </div>
    </div>
  `;
}

async function grupKompleSilOnay(grupAdi) {
  try {
    const res = await api("POST", "/api/satinalma/grup-sil", { grup_adi: grupAdi });
    toast(res.message || "Grup başarıyla silindi.");
    document.getElementById("ozelModalOverlay").remove();
    localStorage.removeItem("sonAcikGrup");
    renderSatinalma(document.getElementById("viewBody"));
  } catch (err) {
    toast(err.message, true);
  }
}

function grupAcKapat(index, grupAdi) {
  const icerik = document.getElementById(`icerik-${index}`);
  const ikon = document.getElementById(`ikon-${index}`);
  
  if (!icerik) return;

  if (icerik.style.display === "none" || icerik.style.display === "") {
    icerik.style.display = "block";
    if (ikon) ikon.style.transform = "rotate(90deg)";
    localStorage.setItem("sonAcikGrup", grupAdi);
  } else {
    icerik.style.display = "none";
    if (ikon) ikon.style.transform = "rotate(0deg)";
    if (localStorage.getItem("sonAcikGrup") === grupAdi) {
      localStorage.removeItem("sonAcikGrup");
    }
  }
}

async function satinAlmaOnayla(id, grupAdi) {
  if (grupAdi) {
    localStorage.setItem("sonAcikGrup", grupAdi);
  }

  const chk = document.querySelector(`.grup-chk[data-id="${id}"]`);
  const mevcutMiktar = chk ? parseFloat(chk.dataset.miktar) || 1 : 1;

  if (state.role === "yonetici") {
    try {
      await api("POST", `/api/satinalma/talepler/${id}/onayla`, { talep_miktari: mevcutMiktar });
      toast("Talep yönetici tarafından onaylandı!");
      renderSatinalma(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  Swal.fire({
    title: 'Termin Tarihi Belirle',
    html: `
      <div style="text-align: left; margin-bottom: 5px;">
        <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Termin Tarihi (Takvimden seçin) *:</label>
        <input type="date" id="onayTerminInput" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box;" value="${new Date().toISOString().split('T')[0]}">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Onayla ve Kaydet',
    cancelButtonText: 'Vazgeç',
    confirmButtonColor: '#28a745',
    reverseButtons: true,
    preConfirm: () => {
      const terminTarihi = document.getElementById('onayTerminInput').value;
      if (!terminTarihi) {
        Swal.showValidationMessage('Lütfen geçerli bir termin tarihi seçin!');
      }
      return { terminTarihi };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      const { terminTarihi } = result.value;
      try {
        await api("POST", `/api/satinalma/talepler/${id}/guncelle`, { 
          talep_miktari: mevcutMiktar,
          termin_tarihi: terminTarihi 
        });

        await api("POST", `/api/satinalma/talepler/${id}/onayla`, { 
          talep_miktari: mevcutMiktar,
          termin_tarihi: terminTarihi 
        });

        toast("Termin tarihi başarıyla kaydedildi ve talep onaylandı!");
        renderSatinalma(document.getElementById("viewBody"));
      } catch (err) {
        try {
          await api("POST", `/api/satinalma/talepler/${id}/guncelle`, { 
            talep_miktari: mevcutMiktar,
            termin_tarihi: terminTarihi,
            durum: "Onaylandı" 
          });
          toast("Termin tarihi kaydedildi!");
          renderSatinalma(document.getElementById("viewBody"));
        } catch(innerErr) {
          toast(err.message, true);
        }
      }
    }
  });
}

async function satinAlmaSil(id) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px;">Talep Silme Onayı</h3>
        <p style="color: #666; font-size: 13px; line-height: 1.4;">Bu talebi silmek istediğinize emin misiniz?</p>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
          <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer;">Evet, Sil</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("modalOnay").onclick = async () => {
    document.getElementById("ozelModal").remove();
    try {
      const r = await api("POST", `/api/satinalma/talepler/${id}/sil`);
      toast(r.message || "Talep silindi.");
      renderSatinalma(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function satinAlmaDuzenleModal(id, malzemeAdi, mevcutMiktar, mevcutTermin = "") {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 8px;">Talep Miktarını / Termin Tarihini Düzenle</h3>
        <p style="color: #666; font-size: 13px; margin-bottom: 15px;"><b>${escapeHtml(malzemeAdi)}</b></p>
        <form id="talepDuzenleForm">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Yeni Talep Miktarı</label>
            <input id="yeniTalepMiktari" type="number" min="1" value="${mevcutMiktar}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-size: 14px; font-weight: bold;" required autofocus>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Termin Tarihi</label>
            <input id="yeniTerminTarihi" type="date" value="${escapeHtml(mevcutTermin || '')}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="modalTalepIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">İptal</button>
            <button type="submit" style="padding: 8px 16px; border: none; background: #f0ad4e; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Güncelle</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("yeniTalepMiktari").select();
  document.getElementById("modalTalepIptal").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("talepDuzenleForm").onsubmit = async (e) => {
    e.preventDefault();
    const yeniMiktar = parseFloat(document.getElementById("yeniTalepMiktari").value);
    const yeniTermin = document.getElementById("yeniTerminTarihi").value;
    document.getElementById("ozelModal").remove();

    try {
      const r = await api("POST", `/api/satinalma/talepler/${id}/guncelle`, { 
        talep_miktari: yeniMiktar,
        termin_tarihi: yeniTermin
      });
      toast(r.message || "Talep başarıyla güncellendi.");
      renderSatinalma(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function tekliflerModalAc(talepId, malzemeAdi, talepMiktari, birim = "Adet") {
  let teklifler = [];
  let gecmisFiyatlar = [];
  try {
    teklifler = await api("GET", `/api/satinalma/teklifler/${talepId}`);
    gecmisFiyatlar = await api("GET", `/api/satinalma/gecmis-fiyatlar/${encodeURIComponent(malzemeAdi)}`);
  } catch (e) {}

  let enDusukFiyat = null;
  if (teklifler.length > 0) {
    enDusukFiyat = Math.min(...teklifler.map(t => t.birim_fiyat));
  }

  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 750px; max-width: 95%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
          <h3 style="margin: 0; color: #333; font-size: 18px;">Tedarikçi Teklif ve Mukayese</h3>
          <button type="button" id="modalKapatBtn" style="background: none; border: none; font-size: 18px; cursor: pointer; font-weight: bold;">✕</button>
        </div>
        
        <p style="color: #555; font-size: 14px; margin-bottom: 15px; display:flex; justify-content: space-between;">
          <span>Malzeme: <b>${escapeHtml(malzemeAdi)}</b> | Miktar: <b>${talepMiktari} ${escapeHtml(birim)}</b></span>
        </p>

        ${gecmisFiyatlar.length > 0 ? `
          <div style="background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 12px;">
            <strong style="display:block; margin-bottom: 4px;">📈 Son Alım Fiyatları (Geçmiş Veri):</strong>
            <ul style="margin: 0; padding-left: 20px;">
              ${gecmisFiyatlar.map(g => `<li>${escapeHtml(g.fatura_tarihi)} - <b>${g.birim_fiyati} ${escapeHtml(g.para_birimi)}</b> (Tedarikçi: ${escapeHtml(g.tedarikci || 'Bilinmiyor')})</li>`).join("")}
            </ul>
          </div>
        ` : `<div style="background: #e9ecef; color: #6c757d; padding: 8px; border-radius: 4px; margin-bottom: 15px; font-size: 12px;">Bu malzeme için sistemde daha önce kaydedilmiş geçmiş fiyat verisi bulunmuyor.</div>`}

        <form id="teklifEkleForm" style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 20px; display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; align-items: end;">
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block; margin-bottom: 2px;">Tedarikçi Firma *</label>
            <input name="tedarikci_adi" placeholder="Firma Adı" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;" required>
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block; margin-bottom: 2px;">Birim Fiyat *</label>
            <input name="birim_fiyat" type="number" step="any" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;" required>
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block; margin-bottom: 2px;">Para Birimi</label>
            <select name="para_birimi" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">
              <option value="TL">TL</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
          <div>
            <button type="submit" style="background: #28a745; color: white; border: none; padding: 7px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">+ Ekle</button>
          </div>
        </form>

        <div class="table-wrap">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f1f1f1; text-align: left; font-size: 12px;">
                <th style="padding: 8px;">Tedarikçi Firma</th>
                <th style="padding: 8px;">Birim Fiyat</th>
                <th style="padding: 8px;">Toplam Tutar</th>
                <th style="padding: 8px; text-align: center;">Durum / Analiz</th>
                <th style="padding: 8px; text-align: right;">İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${
                teklifler.map(t => {
                  const toplamTutar = (t.birim_fiyat * talepMiktari).toFixed(2);
                  const enUcuzMu = t.birim_fiyat === enDusukFiyat;
                  return `
                    <tr style="border-bottom: 1px solid #eee; background-color: ${enUcuzMu ? '#e6ffed' : 'transparent'};">
                      <td style="padding: 8px; font-weight: ${enUcuzMu ? 'bold' : 'normal'};">${escapeHtml(t.tedarikci_adi)}</td>
                      <td style="padding: 8px;" class="num-cell">${t.birim_fiyat} ${escapeHtml(t.para_birimi)}</td>
                      <td style="padding: 8px;" class="num-cell"><b>${toplamTutar} ${escapeHtml(t.para_birimi)}</b></td>
                      <td style="padding: 8px; text-align: center;">
                        ${enUcuzMu ? '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">⭐ En Uygun</span>' : '<span style="color: #666; font-size: 11px;">Alternatif</span>'}
                      </td>
                      <td style="padding: 8px; text-align: right; white-space: nowrap;">
                        <button class="btn btn-sm" style="background-color: #0056b3; color: white; border: none; padding: 2px 6px; font-size: 11px; border-radius: 3px; margin-right: 4px; cursor: pointer;" onclick="siparisFormuPdf(${talepId}, '${escapeHtml(malzemeAdi)}', ${talepMiktari}, '${escapeHtml(birim)}', '${escapeHtml(t.tedarikci_adi)}', ${t.birim_fiyat}, '${escapeHtml(t.para_birimi)}', ${toplamTutar})">📄 PDF Sipariş</button>
                        <button class="btn btn-sm btn-danger-outline" style="padding: 2px 6px; font-size: 11px;" onclick="teklifSil(${t.id}, ${talepId}, '${escapeHtml(malzemeAdi)}', ${talepMiktari}, '${escapeHtml(birim)}')">Sil</button>
                      </td>
                    </tr>
                  `;
                }).join("") || '<tr><td colspan="5"><div class="empty-state" style="padding: 20px; text-align: center; color: #666;">Henüz bu talep için tedarikçi teklifi girilmemiş.</div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("modalKapatBtn").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("teklifEkleForm").onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      talep_id: talepId,
      tedarikci_adi: formData.get("tedarikci_adi"),
      birim_fiyat: formData.get("birim_fiyat"),
      para_birimi: formData.get("para_birimi"),
    };

    try {
      await api("POST", "/api/satinalma/teklif-ekle", payload);
      toast("Teklif başarıyla eklendi.");
      tekliflerModalAc(talepId, malzemeAdi, talepMiktari, birim);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function teklifSil(teklifId, talepId, malzemeAdi, talepMiktari, birim) {
  try {
    await api("POST", `/api/satinalma/teklifler/sil/${teklifId}`);
    toast("Teklif silindi.");
    tekliflerModalAc(talepId, malzemeAdi, talepMiktari, birim);
  } catch (err) {
    toast(err.message, true);
  }
}

function grupSecilenleriPdf(index, grupAdi) {
  const chks = document.querySelectorAll(`#icerik-${index} .grup-chk:checked`);
  if (chks.length === 0) {
    toast("Lütfen PDF oluşturmak için en az bir malzeme seçin!", true);
    return;
  }
  
  const items = Array.from(chks).map(c => ({
    ad: c.dataset.ad,
    miktar: c.dataset.miktar,
    birim: c.dataset.birim
  }));

  cokluSiparisFormuPdf(grupAdi, items);
}

function cokluSiparisFormuPdf(grupAdi, items) {
  const p = window.open('', '_blank', 'width=850,height=900');
  const tarih = new Date().toLocaleDateString('tr-TR');
  const olusturan = state.username;

  const itemsHtml = items.map(item => `
    <tr>
      <td>${item.ad}</td>
      <td style="text-align: center;">${item.miktar} ${item.birim}</td>
      <td></td>
      <td></td>
    </tr>
  `).join("");

  p.document.write(`
    <html>
      <head>
        <title>Toplu Sipariş Formu - ${grupAdi}</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <style>
          body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
          .logo-area { display: flex; flex-direction: column; }
          .doc-title { font-size: 22px; color: #444; font-weight: bold; text-transform: uppercase; margin-top: 10px; }
          .info-table { width: 100%; margin-bottom: 40px; border-collapse: collapse; font-size: 14px; }
          .info-table td { padding: 10px; border: 1px solid #ddd; }
          .info-table td:nth-child(odd) { background: #f4f6f8; font-weight: bold; width: 20%; color: #333; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 14px; }
          .items-table th, .items-table td { border: 1px solid #1a365d; padding: 12px; text-align: left; }
          .items-table th { background: #1a365d; color: white; text-transform: uppercase; font-size: 13px; }
          .total-row td { font-weight: bold; font-size: 16px; background: #f4f6f8; }
          .note { font-size: 11px; color: #777; margin-top: 50px; text-align: center; font-style: italic; border-top: 1px dashed #ccc; padding-top: 15px;}
          .action-bar { background: #e9ecef; padding: 12px; border-radius: 6px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .btn-pdf { background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; }
          .btn-pdf:hover { background: #218838; }
          @media print { body { padding: 0; } .action-bar { display: none; } }
        </style>
      </head>
      <body>
        <div class="action-bar">
          <span style="font-size: 13px; color: #495057; font-weight: bold;">💡 Tek tıkla bilgisayara PDF olarak indirmek için butona basın:</span>
          <button class="btn-pdf" onclick="pdfIndir()">📥 Bilgisayara PDF İndir</button>
        </div>

        <div id="pdfCiktiAlani">
          <div class="header">
            <div class="logo-area"></div>
            <div style="text-align: right;">
              <div class="doc-title">Satın Alma İşlemleri Sipariş Formu</div>
              <div style="font-size: 16px; color: #1a365d; font-weight: bold; margin-top: 5px;">TALEP REF NO: ${grupAdi}</div>
            </div>
          </div>

          <table class="info-table">
            <tr>
              <td>Tedarikçi Firma</td><td></td>
              <td>Tarih</td><td>${tarih}</td>
            </tr>
            <tr>
              <td>Siparişi Oluşturan</td><td>${olusturan.toUpperCase()}</td>
              <td>İlgili Proje/Tekne</td><td></td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th>Malzeme Açıklaması</th>
                <th style="text-align: center; width: 100px;">Miktar</th>
                <th style="text-align: right; width: 120px;">Birim Fiyat</th>
                <th style="text-align: right; width: 120px;">Toplam Tutar</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="3" style="text-align: right;">GENEL TOPLAM :</td>
                <td style="text-align: right;"></td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 13px; color: #555; margin-bottom: 40px; line-height: 1.6;">
            <strong>Önemli Notlar:</strong><br>
            1. Faturanın işbu sipariş formunda belirtilen fiyatlar üzerinden kesilmesi rica olunur.<br>
            2. Teslimatın irsaliye ile depomuza yapılması zorunludur.
          </div>

          <div class="note">Bu evrak Satın Alma İşlemleri tarafından elektronik olarak oluşturulmuştur.</div>
        </div>

        <script>
          function pdfIndir() {
            const element = document.getElementById('pdfCiktiAlani');
            const opt = {
              margin:       10,
              filename:     'Siparis_Formu_${grupAdi.replace(/[^a-zA-Z0-9]/g, '_')}.pdf',
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { scale: 2, useCORS: true },
              jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().from(element).set(opt).save();
          }
        </script>
      </body>
    </html>
  `);
  p.document.close();
}

function siparisFormuPdf(talepId, malzemeAdi, miktar, birim, tedarikci, birimFiyat, paraBirimi, toplamFiyat) {
  const p = window.open('', '_blank', 'width=850,height=900');
  const tarih = new Date().toLocaleDateString('tr-TR');
  const olusturan = state.username;

  p.document.write(`
    <html>
      <head>
        <title>Sipariş Formu - ${tedarikci}</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <style>
          body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
          .logo-area { display: flex; flex-direction: column; }
          .doc-title { font-size: 22px; color: #444; font-weight: bold; text-transform: uppercase; margin-top: 10px; }
          .info-table { width: 100%; margin-bottom: 40px; border-collapse: collapse; font-size: 14px; }
          .info-table td { padding: 10px; border: 1px solid #ddd; }
          .info-table td:nth-child(odd) { background: #f4f6f8; font-weight: bold; width: 20%; color: #333; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 14px; }
          .items-table th, .items-table td { border: 1px solid #1a365d; padding: 12px; text-align: left; }
          .items-table th { background: #1a365d; color: white; text-transform: uppercase; font-size: 13px; }
          .total-row td { font-weight: bold; font-size: 16px; background: #f4f6f8; }
          .note { font-size: 11px; color: #777; margin-top: 50px; text-align: center; font-style: italic; border-top: 1px dashed #ccc; padding-top: 15px;}
          .action-bar { background: #e9ecef; padding: 12px; border-radius: 6px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .btn-pdf { background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; }
          .btn-pdf:hover { background: #218838; }
          @media print { body { padding: 0; } .action-bar { display: none; } }
        </style>
      </head>
      <body>
        <div class="action-bar">
          <span style="font-size: 13px; color: #495057; font-weight: bold;">💡 Tek tıkla bilgisayara PDF olarak indirmek için butona basın:</span>
          <button class="btn-pdf" onclick="pdfIndir()">📥 Bilgisayara PDF İndir</button>
        </div>

        <div id="pdfCiktiAlani">
          <div class="header">
            <div class="logo-area"></div>
            <div style="text-align: right;">
              <div class="doc-title">Satın Alma İşlemleri Sipariş Formu</div>
              <div style="font-size: 16px; color: #1a365d; font-weight: bold; margin-top: 5px;">TALEP REF NO: #${talepId}</div>
            </div>
          </div>

          <table class="info-table">
            <tr>
              <td>Tedarikçi Firma</td><td><b>${tedarikci}</b></td>
              <td>Tarih</td><td>${tarih}</td>
            </tr>
            <tr>
              <td>Siparişi Oluşturan</td><td>${olusturan.toUpperCase()}</td>
              <td>Durum</td><td>Onaylı</td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th>Malzeme Açıklaması</th>
                <th style="text-align: center;">Miktar</th>
                <th style="text-align: right;">Birim Fiyat</th>
                <th style="text-align: right;">Toplam Tutar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${malzemeAdi}</td>
                <td style="text-align: center;">${miktar} ${birim}</td>
                <td style="text-align: right;">${parseFloat(birimFiyat).toLocaleString('tr-TR')} ${paraBirimi}</td>
                <td style="text-align: right;">${parseFloat(toplamFiyat).toLocaleString('tr-TR')} ${paraBirimi}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="text-align: right;">GENEL TOPLAM :</td>
                <td style="text-align: right; color: #d9534f;">${parseFloat(toplamFiyat).toLocaleString('tr-TR')} ${paraBirimi}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 13px; color: #555; margin-bottom: 40px; line-height: 1.6;">
            <strong>Önemli Notlar:</strong><br>
            1. Faturanın işbu sipariş formunda belirtilen fiyatlar üzerinden kesilmesi rica olunur.<br>
            2. Teslimatın irsaliye ile depomuza yapılması zorunludur.
          </div>

          <div class="note">Bu evrak Satın Alma İşlemleri tarafından elektronik olarak oluşturulmuştur.</div>
        </div>

        <script>
          function pdfIndir() {
            const element = document.getElementById('pdfCiktiAlani');
            const opt = {
              margin:       10,
              filename:     'Siparis_Formu_${tedarikci.replace(/[^a-zA-Z0-9]/g, '_')}.pdf',
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { scale: 2, useCORS: true },
              jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().from(element).set(opt).save();
          }
        </script>
      </body>
    </html>
  `);
  p.document.close();
}

// ================= DEMİRBAŞ / ZİMMET =================
let demirbasMod = "yeni";

async function renderDemirbas(body) {
  const isYonetici = state.role === "yonetici";
  const [markalar, personel] = await Promise.all([
    api("GET", "/api/ayarlar?tip=marka"),
    api("GET", "/api/ayarlar?tip=personel"),
  ]);
  const [demirbaslar, zimmetler] = await Promise.all([
    api("GET", "/api/demirbas"),
    api("GET", "/api/zimmet"),
  ]);

  body.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
      <div class="op-toggle" style="margin: 0;">
        <button data-mod="yeni" class="${demirbasMod === "yeni" ? "active" : ""}">Yeni Demirbaş</button>
        <button data-mod="ver" class="${demirbasMod === "ver" ? "active" : ""}">Zimmete Ver</button>
        <button data-mod="iade" class="${demirbasMod === "iade" ? "active" : ""}">İade Al</button>
        <button data-mod="hurda" class="${demirbasMod === "hurda" ? "active" : ""}">Hurdaya Ayır</button>
      </div>
      <div>
        <input type="file" id="zimmetExcelInput" accept=".xlsx, .xls, .csv" style="display: none;" onchange="exceldenZimmetYukle(event)">
        <button onclick="document.getElementById('zimmetExcelInput').click()" style="background-color: #2b579a; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          📤 Excel'den Toplu Zimmet Yükle
        </button>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div id="demirbasFormWrap"></div></div>
      <div class="card">
        <div class="tabs">
          <button class="tab-btn active" data-tab="liste">Demirbaş Listesi</button>
          <button class="tab-btn" data-tab="gecmis">Zimmet Geçmişi</button>
        </div>
        <div id="demirbasTabBody"></div>
      </div>
    </div>`;

  body.querySelectorAll(".op-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      demirbasMod = b.dataset.mod;
      renderDemirbas(body);
    })
  );
  body.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => {
      body.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderDemirbasTab(b.dataset.tab, demirbaslar, zimmetler);
    })
  );
  renderDemirbasTab("liste", demirbaslar, zimmetler);
  renderDemirbasForm(demirbaslar, markalar, personel);
}

function renderDemirbasTab(tab, demirbaslar, zimmetler) {
  const isYonetici = state.role === "yonetici";
  const wrap = document.getElementById("demirbasTabBody");
  if (tab === "liste") {
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>No</th><th>Marka</th><th>Model</th><th>Seri No</th><th>Durum</th><th style="text-align:right;">İşlem</th></tr></thead>
      <tbody>${
        demirbaslar
          .map(
            (d) => `<tr><td class="mono">${escapeHtml(d.demirbas_no)}</td><td>${escapeHtml(d.marka)}</td><td>${escapeHtml(d.model)}</td>
        <td class="mono">${escapeHtml(d.seri_no)}</td><td>${statusBadge(d.durum)}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #f0ad4e; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" 
                data-item="${encodeURIComponent(JSON.stringify(d))}" 
                onclick="demirbasDuzenleModal(this)">Düzenle</button>
          ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" style="padding: 4px 8px; font-size: 11px;" onclick="demirbasSil(${d.id})">Sil</button>` : ''}
        </td></tr>`
          )
          .join("") ||
        `<tr><td colspan="6"><div class="empty-state">Kayıt yok.</div></td></tr>`
      }</tbody></table></div>`;
  } else {
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>No</th><th>İşlem</th><th>Kişi</th><th>Tarih</th><th>Yapan</th><th style="text-align:right;">Sil</th></tr></thead>
      <tbody>${
        zimmetler
          .map((z) => {
            const islem = z.hurda_tarihi ? "Hurda" : z.iade_tarihi ? "İade" : "Zimmet Verildi";
            const kisi = z.zimmetlenen_kisi || z.iade_eden || "—";
            const tarih = z.hurda_tarihi || z.iade_tarihi || z.teslim_tarihi || "—";
            return `<tr><td class="mono">${escapeHtml(z.demirbas_no)}</td><td>${islem}</td><td>${escapeHtml(kisi)}</td><td>${escapeHtml(tarih)}</td><td>${escapeHtml(z.islemi_yapan)}</td>
            <td style="text-align: right;">
              ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" style="padding: 2px 6px; font-size: 11px;" onclick="zimmetSil(${z.id})">🗑️</button>` : ''}
            </td></tr>`;
          })
          .join("") ||
        `<tr><td colspan="6"><div class="empty-state">Kayıt yok.</div></td></tr>`
      }</tbody></table></div>`;
  }
}

function statusBadge(durum) {
  const map = { STOKTA: "badge-ok", ZİMMETLİ: "badge-warn", HURDA: "badge-danger" };
  return `<span class="badge ${map[durum] || "badge-mute"}">${escapeHtml(durum)}</span>`;
}

async function demirbasDuzenleModal(btn) {
  const d = JSON.parse(decodeURIComponent(btn.dataset.item));
  const id = d.id;
  const no = d.demirbas_no || "";
  const marka = d.marka || "";
  const model = d.model || "";
  const seriNo = d.seri_no || "";
  const kondisyon = d.kondisyon || "İyi";
  const miktar = d.miktar || 1;
  const alisTarihi = d.alis_tarihi || "";
  const alisFiyati = d.alis_fiyati || "";
  const aciklama = d.aciklama || "";

  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  let markaOptions = "";
  try {
    const markalar = await api("GET", "/api/ayarlar?tip=marka");
    markaOptions = markalar.map(m => `<option value="${escapeHtml(m.deger)}" ${marka === m.deger ? 'selected' : ''}>${escapeHtml(m.deger)}</option>`).join("");
  } catch(e) {}

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 600px; max-width: 95%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Demirbaş Düzenle (${escapeHtml(no)})</h3>
        <form id="demDuzenleForm">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Marka</label>
              <select id="dMarka" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                <option value="">Seçiniz</option>
                ${markaOptions}
              </select>
            </div>
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Model</label>
              <input id="dModel" value="${escapeHtml(model)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Miktar</label>
              <input id="dMiktar" type="number" value="${miktar}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Seri No</label>
              <input id="dSeri" value="${escapeHtml(seriNo)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Alış Tarihi</label>
              <input id="dAlisTarihi" type="date" value="${escapeHtml(alisTarihi)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div class="field" style="margin: 0;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Alış Fiyatı</label>
              <input id="dAlisFiyati" type="number" step="any" value="${alisFiyati}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div class="field" style="margin: 0; grid-column: span 2;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Kondisyon</label>
              <select id="dKondisyon" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                <option value="Yeni" ${kondisyon==='Yeni'?'selected':''}>Yeni</option>
                <option value="İyi" ${kondisyon==='İyi'?'selected':''}>İyi</option>
                <option value="Orta" ${kondisyon==='Orta'?'selected':''}>Orta</option>
                <option value="Eski" ${kondisyon==='Eski'?'selected':''}>Eski</option>
                <option value="Hurda" ${kondisyon==='Hurda'?'selected':''}>Hurda</option>
              </select>
            </div>
            <div class="field" style="margin: 0; grid-column: span 2;">
              <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Açıklama</label>
              <textarea id="dAciklama" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">${escapeHtml(aciklama)}</textarea>
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button type="button" id="modalDemIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer; font-weight: bold;">İptal</button>
            <button type="submit" style="padding: 8px 16px; border: none; background: #f0ad4e; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Güncelle</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  document.getElementById("modalDemIptal").onclick = () => document.getElementById("ozelModal").remove();
  
  document.getElementById("demDuzenleForm").onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      marka: document.getElementById("dMarka").value,
      model: document.getElementById("dModel").value,
      miktar: document.getElementById("dMiktar").value,
      seri_no: document.getElementById("dSeri").value,
      alis_tarihi: document.getElementById("dAlisTarihi").value,
      alis_fiyati: document.getElementById("dAlisFiyati").value,
      kondisyon: document.getElementById("dKondisyon").value,
      aciklama: document.getElementById("dAciklama").value,
    };

    document.getElementById("ozelModal").remove();
    try {
      await api("POST", `/api/demirbas/${id}/guncelle`, payload);
      toast("Demirbaş başarıyla güncellendi.");
      renderDemirbas(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function renderDemirbasForm(demirbaslar, markalar, personel) {
  const wrap = document.getElementById("demirbasFormWrap");
  const kondisyonlar = ["Yeni", "İyi", "Orta", "Eski"];

  if (demirbasMod === "yeni") {
    const { demirbas_no } = await api("GET", "/api/demirbas/yeni-no");
    wrap.innerHTML = `
      <div class="section-title">Yeni Demirbaş Kaydı</div>
      <form id="demForm">
        <div class="form-grid">
          <div class="field"><label>Demirbaş No</label><input name="demirbas_no" value="${demirbas_no}"></div>
          <div class="field"><label>Marka</label>${selectHtml("marka", markalar)}</div>
          <div class="field"><label>Model</label><input name="model"></div>
          <div class="field"><label>Miktar</label><input name="miktar" type="number" value="1"></div>
          <div class="field"><label>Seri No</label><input name="seri_no"></div>
          <div class="field"><label>Alış Tarihi</label><input name="alis_tarihi" type="date"></div>
          <div class="field"><label>Alış Fiyatı</label><input name="alis_fiyati" type="number" step="any"></div>
          <div class="field"><label>Kondisyon</label><select name="kondisyon">${kondisyonlar.map((k) => `<option>${k}</option>`).join("")}</select></div>
          <div class="field span-2"><label>Açıklama</label><textarea name="aciklama" rows="2"></textarea></div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" type="submit"> ✅ KAYDET </button>
      </form>`;
    document.getElementById("demForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const r = await api("POST", "/api/demirbas/yeni", data);
        toast(r.message);
        renderDemirbas(document.getElementById("viewBody"));
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  if (demirbasMod === "ver") {
    const stoktakiler = demirbaslar.filter((d) => d.durum === "STOKTA");
    wrap.innerHTML = `
      <div class="section-title">Zimmete Ver</div>
      <form id="demForm">
        <div class="form-grid">
          <div class="field span-2"><label>Demirbaş *</label>
            <select name="demirbas_no" required><option value="">Seçiniz</option>
              ${stoktakiler.map((d) => `<option value="${escapeHtml(d.demirbas_no)}">${escapeHtml(d.demirbas_no)} — ${escapeHtml(d.marka)} ${escapeHtml(d.model)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Zimmetlenen Kişi *</label>${selectHtml("zimmetlenen_kisi", personel).replace('name="zimmetlenen_kisi"', 'name="zimmetlenen_kisi" required')}</div>
          <div class="field"><label>Teslim Tarihi</label><input name="teslim_tarihi" type="date"></div>
          <div class="field"><label>Kondisyon</label><select name="kondisyon">${kondisyonlar.map((k) => `<option>${k}</option>`).join("")}</select></div>
          <div class="field span-2"><label>Açıklama</label><textarea name="aciklama" rows="2"></textarea></div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" type="submit">Zimmet Ver</button>
      </form>
      ${!stoktakiler.length ? '<p class="field-hint">Stokta zimmete verilebilecek demirbaş bulunmuyor.</p>' : ""}`;
    document.getElementById("demForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const r = await api("POST", "/api/demirbas/ver", data);
        toast(r.message);
        renderDemirbas(document.getElementById("viewBody"));
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  if (demirbasMod === "iade") {
    const zimmetliler = demirbaslar.filter((d) => d.durum === "ZİMMETLİ");
    wrap.innerHTML = `
      <div class="section-title">İade Al</div>
      <form id="demForm">
        <div class="form-grid">
          <div class="field span-2"><label>Demirbaş *</label>
            <select name="demirbas_no" required><option value="">Seçiniz</option>
              ${zimmetliler.map((d) => `<option value="${escapeHtml(d.demirbas_no)}">${escapeHtml(d.demirbas_no)} — ${escapeHtml(d.marka)} ${escapeHtml(d.model)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>İade Eden Kişi *</label>${selectHtml("iade_eden", personel).replace('name="iade_eden"', 'name="iade_eden" required')}</div>
          <div class="field"><label>İade Tarihi</label><input name="iade_tarihi" type="date"></div>
          <div class="field"><label>Kondisyon</label><select name="kondisyon">${kondisyonlar.map((k) => `<option>${k}</option>`).join("")}</select></div>
          <div class="field span-2"><label>Açıklama</label><textarea name="aciklama" rows="2"></textarea></div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" type="submit"> ✅ İadeyi Kaydet</button>
      </form>
      ${!zimmetliler.length ? '<p class="field-hint">Şu anda zimmetli demirbaş bulunmuyor.</p>' : ""}`;
    document.getElementById("demForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const r = await api("POST", "/api/demirbas/iade", data);
        toast(r.message);
        renderDemirbas(document.getElementById("viewBody"));
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  if (demirbasMod === "hurda") {
    const aktifler = demirbaslar.filter((d) => d.durum !== "HURDA");
    wrap.innerHTML = `
      <div class="section-title">Hurdaya Ayır</div>
      <form id="demForm">
        <div class="form-grid">
          <div class="field span-2"><label>Demirbaş *</label>
            <select name="demirbas_no" required><option value="">Seçiniz</option>
              ${aktifler.map((d) => `<option value="${escapeHtml(d.demirbas_no)}">${escapeHtml(d.demirbas_no)} — ${escapeHtml(d.marka)} ${escapeHtml(d.model)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Hurdaya Ayrılma Tarihi</label><input name="hurda_tarihi" type="date"></div>
          <div class="field"><label>Kondisyon</label><select name="kondisyon">${kondisyonlar.map((k) => `<option>${k}</option>`).join("")}</select></div>
          <div class="field span-2"><label>Açıklama</label><textarea name="aciklama" rows="2"></textarea></div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" type="submit">Hurdaya Ayır</button>
      </form>`;
    document.getElementById("demForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const r = await api("POST", "/api/demirbas/hurda", data);
        toast(r.message);
        renderDemirbas(document.getElementById("viewBody"));
      } catch (err) {
        toast(err.message, true);
      }
    });
  }
}

function demirbasSil(id) {
  if (!confirm("Bu demirbaşı tamamen silmek istediğinize emin misiniz? (Bu işlem geri alınamaz)")) return;
  api("POST", `/api/demirbas/${id}/sil`)
    .then(r => { toast(r.message); renderDemirbas(document.getElementById("viewBody")); })
    .catch(err => toast(err.message, true));
}

function zimmetSil(id) {
  if (!confirm("Zimmet geçmişindeki bu kaydı çöpe atmak istiyor musunuz?")) return;
  api("POST", `/api/zimmet/${id}/sil`)
    .then(r => { toast(r.message); renderDemirbas(document.getElementById("viewBody")); })
    .catch(err => toast(err.message, true));
}

async function ayarlariExceldenYukle(event) {
  const dosya = event.target.files[0];
  if (!dosya) return;

  const okuyucu = new FileReader();
  okuyucu.onload = async function (e) {
    try {
      const veri = new Uint8Array(e.target.result);
      const calismaKitabi = XLSX.read(veri, { type: "array" });
      const sayfaAdi = calismaKitabi.SheetNames.includes("Ayarlar") ? "Ayarlar" : calismaKitabi.SheetNames[0];
      const jsonVerileri = XLSX.utils.sheet_to_json(calismaKitabi.Sheets[sayfaAdi], { header: 1 });

      let basariliSayisi = 0;
      toast("Ayarlar yükleniyor, lütfen bekleyin...");

      for (let i = 1; i < jsonVerileri.length; i++) {
        const satir = jsonVerileri[i];
        if (!satir || satir.length === 0) continue;
        const sutunMap = [
          { index: 0, tip: "marka" }, { index: 1, tip: "kategori" }, { index: 2, tip: "personel" },
          { index: 3, tip: "para_birimi" }, { index: 4, tip: "birim" }, { index: 5, tip: "tekne" }
        ];

        for (let sutun of sutunMap) {
          const deger = String(satir[sutun.index] || "").trim();
          if (deger && deger !== "undefined" && deger !== "null") {
            try {
              await api("POST", "/api/ayarlar", { tip: sutun.tip, deger: deger });
              basariliSayisi++;
            } catch (err) {}
          }
        }
      }
      toast(`${basariliSayisi} adet ayar aktarıldı!`);
      renderAyarlar(document.getElementById("viewBody"));
    } catch (hata) {
      alert("Hata: " + hata.message);
    } finally { event.target.value = ''; }
  };
  okuyucu.readAsArrayBuffer(dosya);
}

async function exceldenZimmetYukle(event) {
  const dosya = event.target.files[0];
  if (!dosya) return;

  const okuyucu = new FileReader();
  okuyucu.onload = async function (e) {
    try {
      const veri = new Uint8Array(e.target.result);
      const calismaKitabi = XLSX.read(veri, { type: "array" });
      const sayfaAdi = calismaKitabi.SheetNames.includes("Zimmet") ? "Zimmet" : calismaKitabi.SheetNames[0];
      const jsonVerileri = XLSX.utils.sheet_to_json(calismaKitabi.Sheets[sayfaAdi], { header: 1 });

      let basariliSayisi = 0;
      toast("Demirbaşlar ve Zimmetler aktarılıyor...");

      for (let i = 1; i < jsonVerileri.length; i++) {
        const satir = jsonVerileri[i];
        if (!satir || satir.length === 0) continue;
        
        const excelDemirbasNo = String(satir[0] || "").trim();
        const marka = String(satir[1] || "").trim();
        const model = String(satir[2] || "").trim();
        const miktar = parseFloat(satir[3]) || 1;
        const seri_no = String(satir[4] || "").trim();
        const personel = String(satir[5] || "").trim();
        let teslim_tarihi = excelTarihCevir(satir[6]);
        const mevcutDurum = String(satir[9] || "").trim().toUpperCase();
        const kondisyon = String(satir[10] || "İyi").trim();
        const aciklama = String(satir[11] || "").trim();
        const hurdaTarihi = excelTarihCevir(satir[12]);

        if (!teslim_tarihi || teslim_tarihi === "undefined") {
            teslim_tarihi = new Date().toISOString().split('T')[0];
        }

        if (marka !== "undefined" || excelDemirbasNo !== "undefined") {
          try {
            const yeniRes = await api("POST", "/api/demirbas/yeni", {
              demirbas_no: (excelDemirbasNo && excelDemirbasNo !== "undefined") ? excelDemirbasNo : undefined,
              marka: marka !== "undefined" ? marka : "",
              model: model !== "undefined" ? model : "",
              miktar: miktar,
              seri_no: seri_no !== "undefined" ? seri_no : "",
              kondisyon: kondisyon !== "undefined" ? kondisyon : "İyi",
              aciklama: aciklama !== "undefined" ? aciklama : ""
            });

            const gercekDemirbasNo = (excelDemirbasNo && excelDemirbasNo !== "undefined") ? excelDemirbasNo : yeniRes.demirbas_no;

            if (mevcutDurum.includes("ZİMMET") || (personel && personel !== "undefined")) {
              await api("POST", "/api/demirbas/ver", {
                demirbas_no: gercekDemirbasNo,
                zimmetlenen_kisi: (personel && personel !== "undefined") ? personel : "Bilinmiyor",
                teslim_tarihi: teslim_tarihi,
                kondisyon: kondisyon !== "undefined" ? kondisyon : "İyi",
                aciklama: aciklama !== "undefined" ? aciklama : ""
              });
            } else if (mevcutDurum.includes("HURDA") || (hurdaTarihi && hurdaTarihi !== "undefined")) {
               await api("POST", "/api/demirbas/hurda", {
                demirbas_no: gercekDemirbasNo,
                hurda_tarihi: (hurdaTarihi && hurdaTarihi !== "undefined") ? hurdaTarihi : new Date().toISOString().split('T')[0],
                kondisyon: kondisyon !== "undefined" ? kondisyon : "Hurda",
                aciklama: aciklama !== "undefined" ? aciklama : ""
              });
            }
            basariliSayisi++;
          } catch (err) {}
        }
      }
      toast(`${basariliSayisi} adet demirbaş/zimmet başarıyla aktarıldı!`);
      renderDemirbas(document.getElementById("viewBody"));
    } catch (hata) {
      alert("Hata: " + hata.message);
    } finally { event.target.value = ''; }
  };
  okuyucu.readAsArrayBuffer(dosya);
}

// ================= AYARLAR =================
const AYAR_TIPLERI = [
  ["marka", "Markalar"],
  ["kategori", "Ürün Kategorileri"],
  ["personel", "Personel"],
  ["para_birimi", "Para Birimi"],
  ["birim", "Birim"],
  ["tekne", "Tekne Numaraları"],
];

async function renderAyarlar(body) {
  const isYonetici = state.role === "yonetici";
  const all = await api("GET", "/api/ayarlar");
  
  let html = `
    <div class="card" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div class="section-title" style="margin: 0;">Sistem Ayarları</div>
      <div>
        <input type="file" id="ayarExcelInput" accept=".xlsx, .xls, .csv" style="display: none;" onchange="ayarlariExceldenYukle(event)">
        <button onclick="document.getElementById('ayarExcelInput').click()" style="background-color: #2b579a; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          📤 Excel'den Toplu Ayar Yükle
        </button>
      </div>
    </div>
    <div class="grid grid-4">
  `;

  html += AYAR_TIPLERI.map(
    ([tip, baslik]) => `
    <div class="card">
      <div class="section-title">${baslik}</div>
      <div class="list-settings" id="list-${tip}">
        ${
          all
            .filter((a) => a.tip === tip)
            .map(
              (a) =>
                `<span class="chip">${escapeHtml(a.deger)}${isYonetici ? `<button data-del="${a.id}">×</button>` : ''}</span>`
            )
            .join("") || '<span class="field-hint">Kayıt yok.</span>'
        }
      </div>
      <form class="ayar-form" data-tip="${tip}" style="margin-top:14px; display:flex; gap:6px;">
        <input name="deger" placeholder="Yeni değer ekle…" style="flex:1; padding:8px 10px; border:1px solid var(--line-2); border-radius:4px;">
        <button class="btn btn-sm" type="submit">Ekle</button>
      </form>
    </div>`
  ).join("");
  
  html += `</div>`;
  body.innerHTML = html;

  body.querySelectorAll(".ayar-form").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const deger = f.deger.value.trim();
      if (!deger) return;
      try {
        await api("POST", "/api/ayarlar", { tip: f.dataset.tip, deger });
        renderAyarlar(body);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
  body.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await api("DELETE", `/api/ayarlar/${b.dataset.del}`);
        renderAyarlar(body);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

// ================= KULLANICILAR =================
async function renderKullanicilar(body) {
  const users = await api("GET", "/api/users");
  body.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Kullanıcı Listesi</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kullanıcı Adı</th>
                <th>Rol</th>
                <th style="text-align: right;">İşlem</th>
              </tr>
            </thead>
            <tbody>${users.map((u) => `
              <tr>
                <td><b>${escapeHtml(u.username)}</b></td>
                <td>
                  ${u.role === 'yonetici' ? '<span class="badge badge-ok">Yönetici</span>' : 
                    u.role === 'satinalma' ? '<span class="badge" style="background-color: #17a2b8; color: white;">Satın Alma İşlemleri</span>' : 
                    u.role === 'depopersoneli' ? '<span class="badge" style="background-color: #6f42c1; color: white;">Depo Personeli</span>' : 
                    '<span class="badge badge-warn">Personel (Talep)</span>'}
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  ${u.username !== 'admin' ? `
                    <button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #f0ad4e; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" onclick="kullaniciYetkiModalAc(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.role)}')">Yetki Düzenle</button>
                    <button class="btn btn-sm btn-danger-outline" data-deluser="${u.id}" style="padding: 4px 8px; font-size: 11px;">Sil</button>
                  ` : '<span style="color: #999; font-size: 11px;">Kilitli Hesap</span>'}
                </td>
              </tr>
            `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Yeni Kullanıcı Ekle</div>
        <form id="userForm">
          <div class="form-grid">
            <div class="field"><label>Kullanıcı Adı *</label><input name="username" required></div>
            <div class="field"><label>Şifre *</label><input name="password" type="password" required></div>
            <div class="field span-2"><label>Yetki / Rol</label>
              <select name="role">
                <option value="personel">Personel (Sadece Satın Alma Talebi Oluşturabilir)</option>
                <option value="depopersoneli">Depo Personeli (Envanter, Giriş/Çıkış, Demirbaş Görebilir)</option>
                <option value="satinalma">Satın Alma İşlemleri Yetkilisi (Sadece Satın Alma Modülü)</option>
                <option value="yonetici">Yönetici (Tam Yetki)</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px" type="submit">Kullanıcı Ekle</button>
        </form>
      </div>
    </div>`;

  document.getElementById("userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api("POST", "/api/users", data);
      toast("Kullanıcı eklendi.");
      renderKullanicilar(body);
    } catch (err) {
      toast(err.message, true);
    }
  });

  body.querySelectorAll("[data-deluser]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Kullanıcıyı silmek istediğinize emin misiniz?")) return;
      try {
        await api("DELETE", `/api/users/${b.dataset.deluser}`);
        renderKullanicilar(body);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

function kullaniciYetkiModalAc(id, username, currentRole) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 15px;">Yetki Düzenle: <span style="color:#0275d8">${escapeHtml(username)}</span></h3>
        <form id="yetkiDuzenleForm">
          <div style="margin-bottom: 20px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; margin-bottom: 4px; display: block;">Kullanıcı Rolü</label>
            <select id="yeniRolSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="personel" ${currentRole === 'personel' ? 'selected' : ''}>Personel (Sadece Satın Alma Talebi)</option>
              <option value="depopersoneli" ${currentRole === 'depopersoneli' ? 'selected' : ''}>Depo Personeli (Envanter, Giriş/Çıkış, Demirbaş)</option>
              <option value="satinalma" ${currentRole === 'satinalma' ? 'selected' : ''}>Satın Alma İşlemleri Yetkilisi</option>
              <option value="yonetici" ${currentRole === 'yonetici' ? 'selected' : ''}>Yönetici (Tam Yetki)</option>
            </select>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="modalYetkiIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">İptal</button>
            <button type="submit" style="padding: 8px 16px; border: none; background: #f0ad4e; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Güncelle</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("modalYetkiIptal").onclick = () => document.getElementById("ozelModal").remove();
  
  document.getElementById("yetkiDuzenleForm").onsubmit = async (e) => {
    e.preventDefault();
    const yeniRol = document.getElementById("yeniRolSelect").value;
    document.getElementById("ozelModal").remove();
    
    try {
      const r = await api("POST", `/api/users/${id}/yetki`, { role: yeniRol });
      toast(r.message || "Yetki başarıyla güncellendi.");
      renderKullanicilar(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ================= FATURALAR =================
async function renderFaturalar(body) {
  const isYonetici = state.role === "yonetici";
  const faturalar = await api("GET", "/api/fatura");
  body.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div class="section-title" style="margin-bottom: 0;">Tüm Fatura ve Alım Kayıtları (${faturalar.length})</div>
        <button onclick="exceleAktar()" style="background-color: #107c41; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          📥 Faturaları Excel'e Aktar
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Malzeme Kodu</th>
              <th>Malzeme Adı</th>
              <th>Miktar</th>
              <th>Lot No</th>
              <th>Üretim Tarihi</th>
              <th>Son Kullanma Tarihi</th>
              <th>Fatura No</th>
              <th>Fatura Tarihi</th>
              <th>Birim Fiyat</th>
              <th>Para Birimi</th>
              <th>Tedarikçi</th>
              <th>İşlemi Yapan</th>
              <th>Kayıt Zamanı</th>
              <th style="text-align: right;">İşlem</th>
            </tr>
          </thead>
          <tbody>${
            faturalar
              .map(
                (f) => `<tr>
              <td class="mono">${escapeHtml(f.malzeme_kodu || "—")}</td>
              <td>${escapeHtml(f.malzeme_tanim)}</td>
              <td class="num-cell">${f.miktar}</td>
              <td class="mono"><span class="badge badge-mute">${escapeHtml(f.lot_no || "—")}</span></td>
              <td class="mono" style="font-size: 11px;">${escapeHtml(f.uretim_tarihi || "—")}</td>
              <td class="mono" style="font-size: 11px; color: #d9534f; font-weight: bold;">${escapeHtml(f.skt || "—")}</td>
              <td class="mono">${escapeHtml(f.fatura_no || "—")}</td>
              <td>${escapeHtml(f.fatura_tarihi || "—")}</td>
              <td class="num-cell">${f.birim_fiyati ? f.birim_fiyati : "—"}</td>
              <td>${escapeHtml(f.para_birimi || "—")}</td>
              <td>${escapeHtml(f.tedarikci || "—")}</td>
              <td>${escapeHtml(f.islemi_yapan)}</td>
              <td class="mono" style="font-size: 12px; color: var(--text-2);">${escapeHtml(f.created_at || "—")}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="btn btn-sm" style="padding: 4px 8px; font-size: 11px; background-color: #f0ad4e; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 4px;" onclick="faturaDuzenleModal(${f.id}, '${escapeHtml(f.malzeme_kodu || "")}', '${escapeHtml(f.malzeme_tanim)}', ${f.miktar}, '${escapeHtml(f.fatura_no || "")}', '${escapeHtml(f.fatura_tarihi || "")}', '${f.birim_fiyati || ""}', '${escapeHtml(f.para_birimi || "")}', '${escapeHtml(f.tedarikci || "")}', '${escapeHtml(f.kategori || "")}', '${escapeHtml(f.lot_no || "")}', '${escapeHtml(f.uretim_tarihi || "")}', '${escapeHtml(f.skt || "")}')">Düzenle</button>
                ${isYonetici ? `<button class="btn btn-sm btn-danger-outline" data-fatura-sil="${f.id}" style="padding: 4px 8px; font-size: 11px;">Sil</button>` : ''}
              </td>
            </tr>`
              )
              .join("") ||
            `<tr><td colspan="14"><div class="empty-state">Henüz kayıtlı fatura bulunmuyor.</div></td></tr>`
          }</tbody>
        </table>
      </div>
    </div>`;


  body.querySelectorAll("[data-fatura-sil]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const faturaId = btn.dataset.faturaSil;
      const eski = document.getElementById("ozelModal");
      if (eski) eski.remove();

      const modalHtml = `
        <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
          <div style="background: white; padding: 24px; border-radius: 8px; width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
            <h3 style="margin-top: 0; color: #333; font-size: 18px;">Fatura Kaydı Silme</h3>
            <p style="color: #666; font-size: 13px; line-height: 1.4;">Bu fatura kaydı geçmişten silinecektir. (Depodaki stok miktarı etkilenmez). Silmek istediğinize emin misiniz?</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
              <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer;">Evet, Sil</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);

      document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();

      document.getElementById("modalOnay").onclick = async () => {
        document.getElementById("ozelModal").remove();
        try {
          const r = await api("POST", `/api/fatura/${faturaId}/sil`);
          toast(r.message);
          renderFaturalar(body);
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  });
}

// ================= FATURA DÜZENLEME =================

function faturaInputTarihi(deger) {
  const metin = String(deger ?? "").trim();

  if (!metin) return "";

  const iso = metin.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (iso) return iso[1];

  const turkce = metin.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (turkce) {
    return `${turkce[3]}-${turkce[2]}-${turkce[1]}`;
  }

  return "";
}

// Önceki stokKaydiDuzenle tanımının yerine bu tanım kullanılır.
// Üretim tarihi ve SKT artık düzenleme penceresine aktarılır.
window.stokKaydiDuzenle = function (f) {
  faturaDuzenleModal(
    f.id,
    f.malzeme_kodu || "",
    f.malzeme_tanim || "",
    f.miktar,
    f.fatura_no || "",
    f.fatura_tarihi || "",
    f.birim_fiyati ?? "",
    f.para_birimi || "",
    f.tedarikci || "",
    f.kategori || "",
    f.lot_no || "",
    f.uretim_tarihi || "",
    f.skt || ""
  );
};

function faturaDuzenleModal(
  id,
  kod,
  ad,
  miktar,
  faturaNo,
  faturaTarihi,
  birimFiyat,
  paraBirimi,
  tedarikci,
  kategori,
  lot_no,
  uretimTarihi = "",
  skt = ""
) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const inputStili =
    "width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;";

  const labelStili =
    "font-size:12px;font-weight:bold;color:#555;display:block;margin-bottom:4px;";

  const modalHtml = `
    <div
      id="ozelModal"
      style="
        position:fixed;
        top:0;
        left:0;
        width:100%;
        height:100%;
        background:rgba(0,0,0,0.5);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9999;
      "
    >
      <div
        style="
          background:white;
          padding:24px;
          border-radius:8px;
          width:520px;
          max-width:95%;
          max-height:90vh;
          overflow-y:auto;
          box-shadow:0 4px 12px rgba(0,0,0,0.2);
          box-sizing:border-box;
        "
      >
        <h3
          style="
            margin-top:0;
            color:#333;
            font-size:18px;
            margin-bottom:15px;
          "
        >
          Fatura / Alım Kaydı Düzenle
        </h3>

        <form id="faturaDuzenleForm">
          <div
            style="
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:10px;
            "
          >
            <div>
              <label for="fKod" style="${labelStili}">
                Kod
              </label>
              <input id="fKod" style="${inputStili}">
            </div>

            <div>
              <label for="fAd" style="${labelStili}">
                Malzeme Adı *
              </label>
              <input id="fAd" style="${inputStili}" required>
            </div>

            <div>
              <label for="fKategori" style="${labelStili}">
                Kategori
              </label>
              <input id="fKategori" style="${inputStili}">
            </div>

            <div>
              <label for="fLot" style="${labelStili}">
                Lot No
              </label>
              <input id="fLot" style="${inputStili}">
            </div>

            <div>
              <label for="fUt" style="${labelStili}">
                Üretim Tarihi
              </label>
              <input id="fUt" type="date" style="${inputStili}">
            </div>

            <div>
              <label for="fSkt" style="${labelStili}">
                Son Kullanma Tarihi
              </label>
              <input id="fSkt" type="date" style="${inputStili}">
            </div>

            <div>
              <label for="fFaturaNo" style="${labelStili}">
                Fatura No
              </label>
              <input id="fFaturaNo" style="${inputStili}">
            </div>

            <div>
              <label for="fTarih" style="${labelStili}">
                Fatura Tarihi
              </label>
              <input id="fTarih" type="date" style="${inputStili}">
            </div>

            <div>
              <label for="fFiyat" style="${labelStili}">
                Birim Fiyat
              </label>
              <input
                id="fFiyat"
                type="number"
                step="any"
                style="${inputStili}"
              >
            </div>

            <div>
              <label for="fPara" style="${labelStili}">
                Para Birimi
              </label>
              <input id="fPara" style="${inputStili}">
            </div>

            <div>
              <label for="fMiktar" style="${labelStili}">
                Miktar *
              </label>
              <input
                id="fMiktar"
                type="number"
                step="any"
                style="${inputStili}"
                required
              >
            </div>

            <div>
              <label for="fTedarikci" style="${labelStili}">
                Tedarikçi
              </label>
              <input id="fTedarikci" style="${inputStili}">
            </div>
          </div>

          <div
            style="
              display:flex;
              justify-content:flex-end;
              gap:10px;
              margin-top:15px;
            "
          >
            <button
              type="button"
              id="modalFaturaIptal"
              style="
                padding:8px 16px;
                border:1px solid #ccc;
                background:#f8f9fa;
                border-radius:4px;
                cursor:pointer;
              "
            >
              İptal
            </button>

            <button
              type="submit"
              id="modalFaturaKaydet"
              style="
                padding:8px 16px;
                border:none;
                background:#f0ad4e;
                color:white;
                border-radius:4px;
                cursor:pointer;
                font-weight:bold;
              "
            >
              Güncelle
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = document.getElementById("ozelModal");
  const form = modal.querySelector("#faturaDuzenleForm");
  const kaydetButonu = modal.querySelector("#modalFaturaKaydet");
  const iptalButonu = modal.querySelector("#modalFaturaIptal");

  const alan = (alanId) => form.querySelector(`#${alanId}`);

  // Değerleri HTML içine gömmek yerine doğrudan alanlara yerleştir.
  alan("fKod").value = kod ?? "";
  alan("fAd").value = ad ?? "";
  alan("fKategori").value = kategori ?? "";
  alan("fLot").value = lot_no ?? "";
  alan("fUt").value = faturaInputTarihi(uretimTarihi);
  alan("fSkt").value = faturaInputTarihi(skt);
  alan("fFaturaNo").value = faturaNo ?? "";
  alan("fTarih").value = faturaInputTarihi(faturaTarihi);
  alan("fFiyat").value = birimFiyat ?? "";
  alan("fPara").value = paraBirimi ?? "";
  alan("fMiktar").value = miktar ?? "";
  alan("fTedarikci").value = tedarikci ?? "";

  let kaydediliyor = false;

  iptalButonu.onclick = () => {
    if (!kaydediliyor) modal.remove();
  };

  form.onsubmit = async (event) => {
    event.preventDefault();

    if (kaydediliyor || !form.reportValidity()) return;

    // ÖNEMLİ: Pencere kaldırılmadan önce tüm alanlar okunur.
    const payload = {
      malzeme_kodu: alan("fKod").value.trim(),
      malzeme_tanim: alan("fAd").value.trim(),
      miktar: alan("fMiktar").value,
      fatura_no: alan("fFaturaNo").value.trim(),
      fatura_tarihi: alan("fTarih").value,
      birim_fiyati: alan("fFiyat").value,
      para_birimi: alan("fPara").value.trim(),
      tedarikci: alan("fTedarikci").value.trim(),
      kategori: alan("fKategori").value.trim(),
      lot_no: alan("fLot").value.trim(),
      uretim_tarihi: alan("fUt").value,
      skt: alan("fSkt").value
    };

    if (!payload.malzeme_tanim) {
      toast("Malzeme adı boş bırakılamaz.", true);
      alan("fAd").focus();
      return;
    }

    if (
      payload.uretim_tarihi &&
      payload.skt &&
      payload.skt < payload.uretim_tarihi
    ) {
      toast(
        "Son kullanma tarihi üretim tarihinden önce olamaz.",
        true
      );
      alan("fSkt").focus();
      return;
    }

    kaydediliyor = true;
    kaydetButonu.disabled = true;
    iptalButonu.disabled = true;
    kaydetButonu.textContent = "Kaydediliyor…";

    try {
      await api(
        "POST",
        `/api/fatura/${encodeURIComponent(id)}/guncelle`,
        payload
      );
    } catch (err) {
      // Kayıt başarısızsa form ve girilen değerler korunur.
      kaydediliyor = false;
      kaydetButonu.disabled = false;
      iptalButonu.disabled = false;
      kaydetButonu.textContent = "Güncelle";

      toast(err.message, true);
      return;
    }

    // Pencere sadece başarılı kayıttan sonra kaldırılır.
    modal.remove();
    toast("Fatura kaydı, üretim tarihi ve SKT güncellendi.");

    const body = document.getElementById("viewBody");
    if (!body) return;

    try {
      if (state.view === "faturalar") {
        await renderFaturalar(body);
      } else if (state.view === "stokgiris") {
        await renderStokGiris(body);
      }
    } catch (err) {
      toast(
        "Kayıt güncellendi ancak liste yenilenemedi: " + err.message,
        true
      );
    }
  };
}

// ================= RAPORLAR MODÜLÜ =================
async function renderRaporlar(body) {
  const detayliVeri = await api("GET", "/api/rapor/detayli");
  const aktifRaporTab = localStorage.getItem("aktifRaporTab") || "tekne";

  body.innerHTML = `
    <div class="card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div class="section-title" style="margin-bottom: 0; text-transform: uppercase; color: #666;">Depo dan Saha Analiz Raporları</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="exceleAktar()" style="background-color: #107c41; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            📥 Aktif Raporu Excel'e Aktar
          </button>
        </div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px;">
      
      <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #ddd;">
        <div onclick="raporGrupAcKapat('tekne')" style="background: #f8f9fa; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="rapor-ikon-tekne" style="font-size: 14px; font-weight: bold; transition: transform 0.2s; ${aktifRaporTab === 'tekne' ? 'transform: rotate(90deg);' : ''}">▶</span>
            <h3 style="margin: 0; font-size: 15px; color: #1a365d;">⛵ Tekne & Personel Çıkışları</h3>
          </div>
        </div>
        <div id="rapor-icerik-tekne" style="display: ${aktifRaporTab === 'tekne' ? 'block' : 'none'}; padding: 15px; border-top: 1px solid #ddd; background: #fff;">
          <div class="section-title">Tekne & Proje Bazlı Malzeme Alan Kişiler</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Tekne No</th><th>Teslim Alan Personel</th><th>Malzeme Adı</th><th>Toplam Miktar</th><th>Raf</th></tr></thead>
              <tbody>${
                detayliVeri.tekneCikislar.map(r => `
                  <tr>
                    <td class="mono"><b>${escapeHtml(r.tekne_no || "Genel")}</b></td>
                    <td><b>${escapeHtml(r.teslim_edilen || "—")}</b></td>
                    <td>${escapeHtml(r.malzeme_tanim)}</td>
                    <td class="num-cell">${r.toplam_miktar}</td>
                    <td>${escapeHtml(r.raf_adresi || "—")}</td>
                  </tr>
                `).join("") || '<tr><td colspan="5"><div class="empty-state">Kayıt bulunmuyor.</div></td></tr>'
              }</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #ddd;">
        <div onclick="raporGrupAcKapat('kisi')" style="background: #f8f9fa; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="rapor-ikon-kisi" style="font-size: 14px; font-weight: bold; transition: transform 0.2s; ${aktifRaporTab === 'kisi' ? 'transform: rotate(90deg);' : ''}">▶</span>
            <h3 style="margin: 0; font-size: 15px; color: #1a365d;">👤 Kişiye Göre Malzeme Raporu</h3>
          </div>
        </div>
        <div id="rapor-icerik-kisi" style="display: ${aktifRaporTab === 'kisi' ? 'block' : 'none'}; padding: 15px; border-top: 1px solid #ddd; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
            <div class="section-title" style="margin-bottom: 0;">Personel Bazlı Harcama ve Malzeme Geçmişi</div>
            <div>
              <label style="font-size: 13px; font-weight: bold; margin-right: 8px;">Personel Seç:</label>
              <select id="personelFiltre" style="padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px;">
                <option value="">Tüm Personeller</option>
                ${detayliVeri.personelListesi.map(p => `<option value="${escapeHtml(p.deger)}">${escapeHtml(p.deger)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="table-wrap" id="personelTabloKapsayici">
            ${renderPersonelTabloHtml(detayliVeri.tumCikislar)}
          </div>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #ddd;">
        <div onclick="raporGrupAcKapat('zimmet')" style="background: #f8f9fa; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="rapor-ikon-zimmet" style="font-size: 14px; font-weight: bold; transition: transform 0.2s; ${aktifRaporTab === 'zimmet' ? 'transform: rotate(90deg);' : ''}">▶</span>
            <h3 style="margin: 0; font-size: 15px; color: #1a365d;">🛠️ Personel Aktif Zimmetler (${detayliVeri.aktifZimmetler.length})</h3>
          </div>
        </div>
        <div id="rapor-icerik-zimmet" style="display: ${aktifRaporTab === 'zimmet' ? 'block' : 'none'}; padding: 15px; border-top: 1px solid #ddd; background: #fff;">
          <div class="section-title">Personel Üzerindeki Aktif Demirbaşlar (Zimmetler)</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Demirbaş No</th><th>Personel</th><th>Marka / Model</th><th>Seri No</th><th>Teslim Tarihi</th><th>Kondisyon</th></tr></thead>
              <tbody>${
                detayliVeri.aktifZimmetler.map(z => `
                  <tr>
                    <td class="mono"><b>${escapeHtml(z.demirbas_no)}</b></td>
                    <td><b>${escapeHtml(z.personel || "—")}</b></td>
                    <td>${escapeHtml(z.marka || "—")} ${escapeHtml(z.model || "")}</td>
                    <td class="mono">${escapeHtml(z.seri_no || "—")}</td>
                    <td>${escapeHtml(z.teslim_tarihi || "—")}</td>
                    <td>${escapeHtml(z.kondisyon || "—")}</td>
                  </tr>
                `).join("") || '<tr><td colspan="6"><div class="empty-state">Şu anda zimmetli demirbaş bulunmuyor.</div></td></tr>'
              }</tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  function renderPersonelTabloHtml(liste) {
    return `
      <table>
        <thead><tr><th>Personel</th><th>Malzeme Adı</th><th>Miktar</th><th>Tekne No</th><th>Raf</th><th>İşlem Yapan</th><th>Zaman</th></tr></thead>
        <tbody>${
          liste.map(c => `
            <tr>
              <td><b>${escapeHtml(c.teslim_edilen || "—")}</b></td>
              <td>${escapeHtml(c.malzeme_tanim)}</td>
              <td class="num-cell">${c.miktar}</td>
              <td class="mono">${escapeHtml(c.tekne_no || "—")}</td>
              <td>${escapeHtml(c.raf_adresi || "—")}</td>
              <td>${escapeHtml(c.islemi_yapan || "—")}</td>
              <td class="mono" style="font-size: 11px;">${escapeHtml(c.created_at || "—")}</td>
            </tr>
          `).join("") || '<tr><td colspan="7"><div class="empty-state">Kayıt bulunamadı.</div></td></tr>'
        }</tbody>
      </table>
    `;
  }

  const personelFiltre = document.getElementById("personelFiltre");
  if (personelFiltre) {
    personelFiltre.onchange = (e) => {
      const secilen = e.target.value;
      const filtrelenmis = secilen 
        ? detayliVeri.tumCikislar.filter(c => c.teslim_edilen === secilen)
        : detayliVeri.tumCikislar;
      document.getElementById("personelTabloKapsayici").innerHTML = renderPersonelTabloHtml(filtrelenmis);
    };
  }

  window.raporGrupAcKapat = function(tabAdi) {
    ['tekne', 'kisi', 'zimmet'].forEach(t => {
      const icerik = document.getElementById(`rapor-icerik-${t}`);
      const ikon = document.getElementById(`rapor-ikon-${t}`);
      if (t === tabAdi) {
        icerik.style.display = "block";
        ikon.style.transform = "rotate(90deg)";
        localStorage.setItem("aktifRaporTab", t);
      } else {
        icerik.style.display = "none";
        ikon.style.transform = "rotate(0deg)";
      }
    });
  };
}

// ---------------- Mobil menü ----------------
const mobileBtn = document.createElement("button");
mobileBtn.className = "mobile-toggle";
mobileBtn.textContent = "☰ Menü";
mobileBtn.addEventListener("click", () =>
  document.querySelector(".sidebar").classList.toggle("open")
);
document.body.appendChild(mobileBtn);

// --- EXCEL'e AKTARMA GÖREVİ ---
async function exceleAktar() {
  try {
    let dosyaAdi = "Depo_Envanter";
    let rowsToExport = [];

    if (state.view === "envanter") {
      const hamRows = await api("GET", "/api/envanter");
      const arananInput = document.getElementById("envanterArama");
      const aranan = arananInput ? arananInput.value.toLocaleLowerCase("tr-TR").trim() : "";

      // Gruplama mantığı (Envanter sayfasındaki ile birebir aynı)
      const urunMap = {};
      hamRows.forEach(r => {
        const key = (r.malzeme_kodu ? r.malzeme_kodu.trim().toUpperCase() : "") + "_" + r.malzeme_adi.trim().toUpperCase() + "_" + (r.raf_adresi ? r.raf_adresi.trim().toUpperCase() : "");
        if (!urunMap[key]) {
          urunMap[key] = { ...r, miktar: 0, detaylar: [] };
        }
        urunMap[key].miktar += num(r.miktar);
        urunMap[key].detaylar.push({
          lot_no: r.lot_no || "—",
          uretim_tarihi: r.uretim_tarihi || "—",
          skt: r.skt || "—",
          miktar: r.miktar
        });
      });
      let rows = Object.values(urunMap);

      // Eğer arama kutusuna yazı yazılmışsa sadece o filtrelenenleri al
      if (aranan) {
        rows = rows.filter(r => {
          const kod = String(r.malzeme_kodu || "").toLocaleLowerCase("tr-TR");
          const ad = String(r.malzeme_adi || "").toLocaleLowerCase("tr-TR");
          const raf = String(r.raf_adresi || "").toLocaleLowerCase("tr-TR");
          const detayStr = r.detaylar.map(d => `${d.lot_no} ${d.uretim_tarihi} ${d.skt}`).join(" ").toLocaleLowerCase("tr-TR");
          return kod.includes(aranan) || ad.includes(aranan) || raf.includes(aranan) || detayStr.includes(aranan);
        });
      }

      const geciciTablo = document.createElement("table");
      geciciTablo.innerHTML = `
        <thead>
          <tr>
            <th>MALZEME KODU</th>
            <th>MALZEME ADI</th>
            <th>Raf Adresi</th>
            <th>Toplam Miktar</th>
            <th>Üretim Birimi</th>
            <th>Lot No</th>
            <th>Üretim Tarihi (ÜT)</th>
            <th>SKT</th>
            <th>KATEGORİ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const lotStr = r.detaylar.map(d => `${d.lot_no} (${d.miktar})`).join(", ");
            const utStr = r.detaylar.map(d => d.uretim_tarihi).join(", ");
            const sktStr = r.detaylar.map(d => d.skt).join(", ");
            return `
              <tr>
                <td>${escapeHtml(r.malzeme_kodu || "")}</td>
                <td>${escapeHtml(r.malzeme_adi || "")}</td>
                <td>${escapeHtml(r.raf_adresi || "")}</td>
                <td>${r.miktar}</td>
                <td>${escapeHtml(r.birim || "Adet")}</td>
                <td>${escapeHtml(lotStr)}</td>
                <td>${escapeHtml(utStr)}</td>
                <td>${escapeHtml(sktStr)}</td>
                <td>${escapeHtml(r.kategori || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      `;

      const calismaKitabi = XLSX.utils.table_to_book(geciciTablo, { sheet: "Envanter" });
      let tarihStr = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
      XLSX.writeFile(calismaKitabi, `${dosyaAdi}_${tarihStr}.xlsx`);
      toast("Filtrelenen ürünler başarıyla Excel'e aktarıldı!");
      return;
    }

    // Diğer sayfalar için standart akış
    let endpoint = "/api/fatura";
    if (state.view === "stokcikis") endpoint = "/api/cikislar";
    else if (state.view === "satinalma") endpoint = "/api/satinalma/talepler";

    const rows = await api("GET", endpoint);
    const aktifTablo = document.querySelector("table");
    const geciciTablo = document.createElement("table");
    if (aktifTablo) {
      const kopya = aktifTablo.cloneNode(true);
      kopya.querySelectorAll("tr").forEach(satir => {
        if (satir.children.length > 0) satir.removeChild(satir.children[satir.children.length - 1]);
      });
      geciciTablo.innerHTML = kopya.innerHTML;
    }

    const calismaKitabi = XLSX.utils.table_to_book(geciciTablo, { sheet: "Rapor" });
    let tarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
    XLSX.writeFile(calismaKitabi, `Rapor_${tarih}.xlsx`);
    toast("Liste Excel'e aktarıldı!");
  } catch (err) {
    toast("Excel aktarılırken hata oluştu: " + err.message, true);
  }
}

function modernSilOnay(id) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 350px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px;">Silme Onayı</h3>
        <p style="color: #666; font-size: 14px;">Bu malzemeyi envanterden silmek istediğinize emin misiniz?</p>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button id="modalIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">İptal</button>
          <button id="modalOnay" style="padding: 8px 16px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer;">Sil</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("modalIptal").onclick = () => document.getElementById("ozelModal").remove();
  document.getElementById("modalOnay").onclick = async () => {
    document.getElementById("ozelModal").remove();
    try {
      const r = await api("POST", `/api/envanter/${id}/sil`);
      toast(r.message || "Malzeme başarıyla silindi.");
      renderEnvanter(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function modernDuzenleModal(id, kod, ad, raf, miktar, birim, kategori, lotNo) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  let mevcutLotlar = [];
  try {
    const hamRows = await api("GET", "/api/envanter");
    mevcutLotlar = [...new Set(hamRows
      .filter(r => r.malzeme_adi.trim().toUpperCase() === ad.trim().toUpperCase() && r.lot_no && r.lot_no.trim() !== "" && r.lot_no.trim() !== "—")
      .map(r => r.lot_no)
    )];
  } catch(e) {}

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 450px; max-width: 95%; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 15px;">Malzeme Düzenle</h3>
        <form id="modernDuzenleForm">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label style="font-size: 12px; font-weight: bold; color: #555;">Kodu</label><input id="mKod" value="${escapeHtml(kod)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
            <div><label style="font-size: 12px; font-weight: bold; color: #555;">Adı *</label><input id="mAd" value="${escapeHtml(ad)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required></div>
            <div><label style="font-size: 12px; font-weight: bold; color: #555;">Kategori</label><input id="mKategori" value="${escapeHtml(kategori)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
            <div>
              <label style="font-size: 12px; font-weight: bold; color: #555;">Lot Numarası</label>
              <select id="mLot" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background-color: #fff;">
                <option value="">Lot Yok / Belirsiz</option>
                ${mevcutLotlar.map(l => `<option value="${escapeHtml(l)}" ${l === lotNo ? 'selected' : ''}>${escapeHtml(l)}</option>`).join("")}
              </select>
            </div>
            <div><label style="font-size: 12px; font-weight: bold; color: #555;">Raf *</label><input id="mRaf" value="${escapeHtml(raf)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required></div>
            <div><label style="font-size: 12px; font-weight: bold; color: #555;">Birim</label><input id="mBirim" value="${escapeHtml(birim)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
            <div style="grid-column: span 2;"><label style="font-size: 12px; font-weight: bold; color: #555;">Miktar *</label><input id="mMiktar" type="number" step="any" value="${miktar}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required></div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top:20px;">
            <button type="button" id="modalDuzenleIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">İptal</button>
            <button type="submit" style="padding: 8px 16px; border: none; background: #0275d8; color: white; border-radius: 4px; cursor: pointer;">Kaydet</button>
          </div>
        </form>
      </div>
    </div>`;
    
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("modalDuzenleIptal").onclick = () => document.getElementById("ozelModal").remove();
  
  document.getElementById("modernDuzenleForm").onsubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
      malzeme_kodu: document.getElementById("mKod")?.value || "",
      malzeme_adi: document.getElementById("mAd")?.value || "",
      raf_adresi: document.getElementById("mRaf")?.value || "",
      miktar: parseFloat(document.getElementById("mMiktar")?.value) || 0,
      birim: document.getElementById("mBirim")?.value || "Adet",
      kategori: document.getElementById("mKategori")?.value || "",
      lot_no: document.getElementById("mLot")?.value || ""
    };

    try {
      await api("POST", `/api/envanter/${id}/guncelle`, payload);
      document.getElementById("ozelModal")?.remove();
      toast("Malzeme başarıyla güncellendi.");
      renderEnvanter(document.getElementById("viewBody"));
    } catch (err) { 
      toast(err.message, true); 
    }
  };
}

// ================= TEKNE ÜRETİM ATÖLYESİ (GELİŞMİŞ KANBAN) =================
async function renderTekneUretim(body) {
  let rawData = [];
  try {
    rawData = await api("GET", "/api/tekne-uretim");
  } catch(e) {}
  
  const asamaSirasi = ['Gövde Yapımı', 'Güverte', 'Donatım', 'Boya'];

  const tekneler = rawData.map(item => ({
    id: item.id,
    tekne_no: item.tekne_no || "Bilinmeyen Tekne",
    model: item.model || "Özel Proje",
    asama: item.asama_adi || item.asama || 'Gövde Yapımı',
    notlar: item.notlar || ''
  }));

  let boardHtml = `<div class="kanban-board">`;

  asamaSirasi.forEach((asama, asamaIndex) => {
    const buAsamdakiTekneler = tekneler.filter(t => t.asama === asama);
    
    boardHtml += `
      <div class="kanban-col" 
           ondragover="kAllowDrop(event)" 
           ondragleave="kDragLeave(event)"
           ondrop="kDrop(event, '${asama}')">
        
        <div class="kanban-col-header">
          <span>${asama}</span>
          <span class="kanban-badge">${buAsamdakiTekneler.length}</span>
        </div>
        
        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
          ${buAsamdakiTekneler.map(t => {
            let progressHtml = '';
            for(let i=0; i<4; i++) {
              if (i < asamaIndex) progressHtml += `<div class="k-step done"></div>`;
              else if (i === asamaIndex) progressHtml += `<div class="k-step active"></div>`;
              else progressHtml += `<div class="k-step"></div>`;
            }
            
            const borderColor = asamaIndex === 3 ? '#36b37e' : '#0052cc';

            return `
              <div class="kanban-card" draggable="true" ondragstart="kDragStart(event)" ondragend="kDragEnd(event)" data-id="${t.id}" style="border-left-color: ${borderColor};">
                <div class="k-header">
                  <div class="k-title">⛵ ${escapeHtml(t.tekne_no)}</div>
                  <button class="k-menu-btn" onclick="tekneSecenekler(${t.id}, '${escapeHtml(t.tekne_no)}')">⋮</button>
                </div>
                <div class="k-model">Model: <b>${escapeHtml(t.model)}</b></div>
                
                <div class="k-progress">
                  ${progressHtml}
                </div>
                <div class="k-footer">
                  <span>${t.notlar ? '📝 ' + escapeHtml(t.notlar) : 'Durum iyi'}</span>
                  <span style="font-size: 10px; color: #888;">#${t.id}</span>
                </div>
              </div>
            `;
          }).join("") || '<div style="text-align: center; color: #aaa; padding: 20px; font-size: 12px;">Bu aşamada tekne yok</div>'}
        </div>
      </div>
    `;
  });

  boardHtml += `</div>`;

  body.innerHTML = `
    <div class="card" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div class="section-title" style="margin: 0;">Tekne Üretim Atölyesi (Kanban Takip Panosu)</div>
      <button class="btn btn-primary" onclick="yeniTekneModalAc()" style="background-color: #2b579a; font-weight: bold; display: flex; align-items: center; gap: 6px;">
        ➕ Yeni Tekne / Proje Ekle
      </button>
    </div>
    ${boardHtml}
  `;
}

window.kDragStart = function(e) {
  e.dataTransfer.setData("text/plain", e.target.dataset.id);
  e.target.classList.add("dragging");
};

window.kDragEnd = function(e) {
  e.target.classList.remove("dragging");
};

window.kAllowDrop = function(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.add("drag-over");
};

window.kDragLeave = function(e) {
  e.currentTarget.classList.remove("drag-over");
};

window.kDrop = async function(e, yeniAsama) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove("drag-over");
  
  const id = e.dataTransfer.getData("text/plain");
  if (!id) return;

  try {
    await api("POST", `/api/tekne-uretim/${id}/asama`, { asama: yeniAsama });
    toast(`Tekne başarıyla "${yeniAsama}" aşamasına taşındı.`);
    renderTekneUretim(document.getElementById("viewBody"));
  } catch (err) {
    toast(err.message, true);
  }
};

async function yeniTekneModalAc() {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  let tekneOps = "";
  try {
    const list = await api("GET", "/api/ayarlar?tip=tekne");
    tekneOps = list.map(t => `<option value="${escapeHtml(t.deger)}">${escapeHtml(t.deger)}</option>`).join("");
  } catch(e) {}

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 15px;">Yeni Tekne / Proje Ekle</h3>
        <form id="yeniTekneForm">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Tekne No / Proje Adı *</label>
            <input name="tekne_no" list="dl-tekneler-modal" required placeholder="Örn: Tekne-05 veya Özel Proje" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <datalist id="dl-tekneler-modal">${tekneOps}</datalist>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Model / Tip</label>
            <input name="model" placeholder="Örn: Flybridge 50ft" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Başlangıç Aşaması</label>
            <select name="asama" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="Gövde Yapımı">Gövde Yapımı</option>
              <option value="Güverte">Güverte</option>
              <option value="Donatım">Donatım</option>
              <option value="Boya">Boya</option>
            </select>
          </div>
          <div style="margin-bottom: 20px;">
            <label style="font-size: 12px; font-weight: bold; color: #555; display: block; margin-bottom: 4px;">Notlar</label>
            <textarea name="notlar" rows="2" placeholder="Proje notları..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;"></textarea>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="modalTekneIptal" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">İptal</button>
            <button type="submit" style="padding: 8px 16px; border: none; background: #2b579a; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Kaydet</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("modalTekneIptal").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("yeniTekneForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    document.getElementById("ozelModal").remove();
    try {
      await api("POST", "/api/tekne-uretim", data);
      toast("Yeni tekne projeye eklendi.");
      renderTekneUretim(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function tekneSecenekler(id, tekneNo) {
  const eski = document.getElementById("ozelModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="ozelModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 24px; border-radius: 8px; width: 350px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <h3 style="margin-top: 0; color: #333; font-size: 18px; margin-bottom: 10px;">Tekne İşlemleri</h3>
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;"><b>${escapeHtml(tekneNo)}</b> için yapmak istediğiniz işlemi seçin:</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button id="modalTekneSilBtn" style="padding: 10px; border: none; background: #d9534f; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">🗑️ Projeyi / Tekneyi Sil</button>
          <button id="modalTekneKapatBtn" style="padding: 10px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Vazgeç</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("modalTekneKapatBtn").onclick = () => document.getElementById("ozelModal").remove();

  document.getElementById("modalTekneSilBtn").onclick = async () => {
    document.getElementById("ozelModal").remove();
    if (!confirm(`"${tekneNo}" projesini silmek istediğinize emin misiniz?`)) return;
    try {
      await api("POST", `/api/tekne-uretim/${id}/sil`);
      toast("Tekne projesi silindi.");
      renderTekneUretim(document.getElementById("viewBody"));
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function formatTermin(tarihStr) {
  if (!tarihStr) return "—";
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const hedef = new Date(tarihStr);
  hedef.setHours(0, 0, 0, 0);
  
  const farkGun = Math.round((hedef - bugun) / (1000 * 60 * 60 * 24));
  if (isNaN(farkGun)) return escapeHtml(tarihStr);
  
  let aciklama = "";
  if (farkGun < 0) {
    aciklama = `${Math.abs(farkGun)} gün geçti`;
  } else if (farkGun === 0) {
    aciklama = `Bugün`;
  } else if (farkGun === 1) {
    aciklama = `Yarın`;
  } else if (farkGun > 1 && farkGun < 7) {
    aciklama = `${farkGun} gün kaldı`;
  } else if (farkGun >= 7 && farkGun < 30) {
    const hafta = Math.round(farkGun / 7);
    aciklama = `${hafta} hafta kaldı`;
  } else {
    const ay = Math.round(farkGun / 30);
    aciklama = `${ay} ay kaldı`;
  }
  
  return `${escapeHtml(tarihStr)} <span style="font-weight: normal; color: #666; font-size: 10px;">(${aciklama})</span>`;
}

// ================= MESAİ TAKİP MODÜLÜ =================
const RESMI_TATILLER = {
  "2026-01-01": "Yılbaşı",
  "2026-03-19": "Ramazan Bayramı Arifesi",
  "2026-03-20": "Ramazan Bayramı 1. Gün",
  "2026-03-21": "Ramazan Bayramı 2. Gün",
  "2026-03-22": "Ramazan Bayramı 3. Gün",
  "2026-04-23": "23 Nisan",
  "2026-05-01": "1 Mayıs",
  "2026-05-19": "19 Mayıs",
  "2026-05-26": "Kurban Bayramı Arifesi",
  "2026-05-27": "Kurban Bayramı 1. Gün",
  "2026-05-28": "Kurban Bayramı 2. Gün",
  "2026-05-29": "Kurban Bayramı 3. Gün",
  "2026-05-30": "Kurban Bayramı 4. Gün",
  "2026-07-15": "15 Temmuz",
  "2026-08-30": "30 Ağustos",
  "2026-10-28": "Cumhuriyet Bayramı Arifesi",
  "2026-10-29": "29 Ekim"
};

function gunAdiBul(tarihStr) {
  const gunler = ["PAZAR", "PAZARTESİ", "SALI", "ÇARŞAMBA", "PERŞEMBE", "CUMA", "CUMARTESİ"];
  return gunler[new Date(tarihStr + "T00:00:00Z").getUTCDay()];
}

function ozelGunMu(tarihStr) {
  const haftaGunu = new Date(tarihStr + "T00:00:00Z").getUTCDay();
  const resmiTatilAdi = RESMI_TATILLER[tarihStr];
  return { ozel: haftaGunu === 0 || !!resmiTatilAdi, pazar: haftaGunu === 0, resmiTatilAdi };
}

function personelSelectHtml(name, personelListesi, secili = "") {
  return `<select name="${name}" required>
    <option value="">Personel Seçiniz</option>
    ${(personelListesi || []).map(p => `<option value="${escapeHtml(p.deger)}" ${p.deger === secili ? "selected" : ""}>${escapeHtml(p.deger)}</option>`).join("")}
  </select>`;
}

async function renderMesaiTakip(body) {
  let personelListesi = [];
  let mesaiKayitlari = [];
  try {
    const [pRes, mRes] = await Promise.all([
      api("GET", "/api/ayarlar?tip=personel"),
      api("GET", "/api/mesai")
    ]);
    personelListesi = pRes || [];
    mesaiKayitlari = mRes || [];
  } catch (e) {}

  const sekme = localStorage.getItem("mesaiSekme") || "giris";

  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn ${sekme === "giris" ? "active" : ""}" onclick="mesaiSekmeDegis('giris')">Mesai Girişi</button>
      <button class="tab-btn ${sekme === "tablo" ? "active" : ""}" onclick="mesaiSekmeDegis('tablo')">Aylık Mesai Tablosu</button>
    </div>
    <div id="mesaiSekmeIcerik"></div>
  `;

  const icerik = document.getElementById("mesaiSekmeIcerik");

  if (sekme === "tablo") {
    icerik.innerHTML = mesaiAylikTabloHtml(personelListesi, mesaiKayitlari);
    mesaiTabloEventleriBagla(body);
  } else {
    icerik.innerHTML = mesaiGirisHtml(personelListesi, mesaiKayitlari);
    mesaiGirisEventleriBagla(body);
  }
}

function mesaiSekmeDegis(sekmeAdi) {
  localStorage.setItem("mesaiSekme", sekmeAdi);
  renderMesaiTakip(document.getElementById("viewBody"));
}

function mesaiGirisHtml(personelListesi, mesaiKayitlari) {
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Yeni Mesai / Çalışma Süresi Ekle</div>
        <form id="mesaiForm">
          <div class="form-grid">
            <div class="field span-2">
              <label>Personel Seçin *</label>
              ${personelSelectHtml("personel_adi", personelListesi)}
            </div>
            <div class="field">
              <label>Tarih *</label>
              <input name="tarih" type="date" required value="${new Date().toISOString().split("T")[0]}">
            </div>
            <div class="field">
              <label>Mesai / Çalışma Süresi (Saat) *</label>
              <input name="mesai_suresi" type="number" step="any" placeholder="Örn: 5.5 veya 8" required>
            </div>
            <div class="field span-2">
              <label>Açıklama / Notlar</label>
              <textarea name="aciklama" rows="2" placeholder="İsteğe bağlı açıklama..."></textarea>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top: 16px;" type="submit">Mesaiyi Kaydet</button>
        </form>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div class="section-title" style="margin-bottom: 0;">Mesai Geçmişi (${mesaiKayitlari.length})</div>
          <button type="button" class="btn btn-sm" onclick="mesaiExceleAktar()">Excel'e Aktar</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Personel Adı</th>
                <th>Süre</th>
                <th>Açıklama</th>
                <th style="text-align: right;">İşlem</th>
              </tr>
            </thead>
            <tbody>
              ${mesaiKayitlari.map(m => `
                <tr>
                  <td class="mono">${escapeHtml(m.tarih)}</td>
                  <td><b>${escapeHtml(m.personel_adi)}</b></td>
                  <td class="num-cell" style="color: var(--signal);">${m.mesai_suresi} sa</td>
                  <td style="font-size: 12px; color: var(--text-mute);">${escapeHtml(m.aciklama || "—")}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-sm btn-danger-outline" onclick="mesaiSil(${m.id})">Sil</button>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="5"><div class="empty-state">Kayıtlı mesai bulunmuyor.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function mesaiAylikTabloHtml(personelListesi, mesaiKayitlari) {
  const seciliAy = localStorage.getItem("mesaiTabloAy") || new Date().toISOString().slice(0, 7);
  const [yil, ay] = seciliAy.split("-").map(Number);
  const ayinGunSayisi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  const ayAdlari = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  const gunler = [];
  for (let g = 1; g <= ayinGunSayisi; g++) {
    const tarih = `${seciliAy}-${String(g).padStart(2, "0")}`;
    gunler.push({ tarih, ...ozelGunMu(tarih) });
  }

  const personelAdlari = (personelListesi || []).map(p => p.deger);

  const hucreDeger = (ad, tarih) => mesaiKayitlari
    .filter(m => m.personel_adi === ad && m.tarih === tarih)
    .reduce((toplam, m) => toplam + (Number(m.mesai_suresi) || 0), 0);

  const toplamlar = {};
  personelAdlari.forEach(ad => { toplamlar[ad] = { haftaIci: 0, haftaSonu: 0 }; });
  gunler.forEach(g => {
    personelAdlari.forEach(ad => {
      const deger = hucreDeger(ad, g.tarih);
      if (!deger) return;
      if (g.ozel) toplamlar[ad].haftaSonu += deger;
      else toplamlar[ad].haftaIci += deger;
    });
  });

  if (!personelAdlari.length) {
    return `<div class="card"><div class="empty-state">Bu tabloyu görebilmek için Ayarlar &rsaquo; Personel bölümünden personel eklemeniz gerekiyor.</div></div>`;
  }

  return `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 6px;">
        <div class="section-title" style="margin-bottom: 0;">${ayAdlari[ay - 1]} ${yil} — Aylık Mesai Tablosu</div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="month" id="mesaiTabloAySecici" value="${seciliAy}">
          <button type="button" class="btn btn-sm" onclick="mesaiExceleAktar()">Excel'e Aktar</button>
        </div>
      </div>
      <div style="font-size: 11.5px; color: var(--text-mute); margin-bottom: 14px;">
        <span style="display: inline-block; width: 11px; height: 11px; background: #fff3b0; border: 1px solid #e3ce62; border-radius: 2px; vertical-align: -1px; margin-right: 5px;"></span>
        Pazar günleri ve resmi tatiller — hafta sonu mesaisi olarak ayrı toplanır
      </div>
      <div class="table-wrap">
        <table class="mesai-tablo">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Gün</th>
              ${personelAdlari.map(ad => `<th style="text-align: center;">${escapeHtml(ad)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${gunler.map(g => `
              <tr class="${g.ozel ? "mesai-ozel-gun" : ""}">
                <td class="mono">${g.tarih.split("-").reverse().join(".")}</td>
                <td>
                  ${gunAdiBul(g.tarih)}
                  ${g.resmiTatilAdi ? `<span class="badge badge-warn" style="margin-left: 6px;">${escapeHtml(g.resmiTatilAdi)}</span>` : ""}
                </td>
                ${personelAdlari.map(ad => {
                  const deger = hucreDeger(ad, g.tarih);
                  return `<td class="num-cell" style="text-align: center;">${deger ? deger : ""}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr class="mesai-toplam-satiri">
              <td colspan="2">Hafta İçi Mesai Süresi</td>
              ${personelAdlari.map(ad => `<td style="text-align: center;">${toplamlar[ad].haftaIci || "—"}</td>`).join("")}
            </tr>
            <tr class="mesai-toplam-satiri">
              <td colspan="2">Hafta Sonu / Resmi Tatil Mesai Süresi</td>
              ${personelAdlari.map(ad => `<td style="text-align: center;">${toplamlar[ad].haftaSonu || "—"}</td>`).join("")}
            </tr>
            <tr class="mesai-toplam-satiri mesai-genel-toplam">
              <td colspan="2">TOPLAM MESAİ SÜRESİ</td>
              ${personelAdlari.map(ad => `<td style="text-align: center;">${(toplamlar[ad].haftaIci + toplamlar[ad].haftaSonu) || "—"}</td>`).join("")}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function mesaiGirisEventleriBagla(body) {
  document.getElementById("mesaiForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await api("POST", "/api/mesai", data);
      toast(res.message || "Mesai başarıyla kaydedildi.");
      renderMesaiTakip(body);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function mesaiTabloEventleriBagla(body) {
  const secici = document.getElementById("mesaiTabloAySecici");
  if (secici) {
    secici.onchange = () => {
      localStorage.setItem("mesaiTabloAy", secici.value);
      renderMesaiTakip(body);
    };
  }
}

async function mesaiSil(id) {
  if (!confirm("Bu mesai kaydını silmek istediğinize emin misiniz?")) return;
  try {
    await api("POST", `/api/mesai/${id}/sil`);
    toast("Mesai kaydı silindi.");
    renderMesaiTakip(document.getElementById("viewBody"));
  } catch (err) {
    toast(err.message, true);
  }
}

async function mesaiExceleAktar() {
  try {
    const [mesaiKayitlari, personelListesi] = await Promise.all([
      api("GET", "/api/mesai"),
      api("GET", "/api/ayarlar?tip=personel")
    ]);

    if (!mesaiKayitlari || !mesaiKayitlari.length) {
      toast("Aktarılacak mesai kaydı bulunamadı!", true);
      return;
    }

    let personeller = personelListesi.map(p => String(p.deger || "").trim());
    mesaiKayitlari.forEach(m => {
      const pAdi = String(m.personel_adi || "").trim();
      if (pAdi && !personeller.includes(pAdi)) personeller.push(pAdi);
    });
    personeller.sort();

    const tarihler = mesaiKayitlari.map(m => m.tarih).filter(Boolean).sort();
    if (tarihler.length === 0) {
      toast("Geçerli tarih bulunamadı!", true);
      return;
    }

    const ilkTarih = new Date(tarihler[0]);
    const yil = ilkTarih.getFullYear();
    const ay = ilkTarih.getMonth();

    const ayinGunleri = [];
    const gunSayisi = new Date(yil, ay + 1, 0).getDate();
    const gunIsimleri = ["PAZAR", "PAZARTESİ", "SALI", "ÇARŞAMBA", "PERŞEMBE", "CUMA", "CUMARTESİ"];

    for (let gun = 1; gun <= gunSayisi; gun++) {
      const d = new Date(yil, ay, gun);
      const yilStr = d.getFullYear();
      const ayStr = String(d.getMonth() + 1).padStart(2, "0");
      const gunStr = String(d.getDate()).padStart(2, "0");

      const tarihFormatted = `${gunStr}.${ayStr}.${yilStr}`;
      const isoTarih = `${yilStr}-${ayStr}-${gunStr}`;
      const dayOfWeek = d.getDay();
      const resmiTatilAdi = RESMI_TATILLER[isoTarih];

      ayinGunleri.push({
        tarih: tarihFormatted,
        gunAdi: gunIsimleri[dayOfWeek],
        // Pazar VEYA resmi tatil ise "özel gün" (hafta sonu grubuna girer, hafta içi bloğunu böler)
        ozelGun: dayOfWeek === 0 || !!resmiTatilAdi
      });
    }

    let satir1 = ["PERSONEL ADI SOYADI", "GÜNLER", ...personeller];
    let satir2 = ["TARİH", "GÜNLER", ...personeller.map(() => "MESAİ SÜRESİ")];

    let matrisVeri = [satir1, satir2];

    ayinGunleri.forEach((gunObj) => {
      let satir = [gunObj.tarih, gunObj.gunAdi];
      personeller.forEach(personelAdi => {
        const kayit = mesaiKayitlari.find(m => {
          const parts = String(m.tarih || "").trim().split("-");
          const mFormatted = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : m.tarih;
          return mFormatted === gunObj.tarih && String(m.personel_adi || "").trim() === personelAdi;
        });
        satir.push(kayit ? parseFloat(kayit.mesai_suresi || 0) : "");
      });
      matrisVeri.push(satir);
    });

    matrisVeri.push(Array(personeller.length + 2).fill(""));

    const veriBaslangic = 3;
    const veriBitis = veriBaslangic + ayinGunleri.length - 1;

    // Hafta içi bloklarını ve özel (Pazar / Resmi Tatil) günlerin satır numaralarını ayır
    let haftaIciGruplar = [];
    let ozelGunSatirlari = [];

    let blokBasla = veriBaslangic;
    ayinGunleri.forEach((g, idx) => {
      const satirNo = veriBaslangic + idx;
      if (g.ozelGun) {
        if (blokBasla <= satirNo - 1) {
          haftaIciGruplar.push({ start: blokBasla, end: satirNo - 1 });
        }
        ozelGunSatirlari.push(satirNo);
        blokBasla = satirNo + 1;
      }
    });
    if (blokBasla <= veriBitis) {
      haftaIciGruplar.push({ start: blokBasla, end: veriBitis });
    }

    let satirHaftaIci = ["HAFTA İÇİ MESAİ SÜRESİ", ""];
    let satirHaftaSonu = ["HAFTA SONU / RESMİ TATİL MESAİ SÜRESİ", ""];
    let satirToplam = ["TOPLAM MESAİ SÜRESİ", ""];

    const haftaIciSatirNo = veriBitis + 2;
    const haftaSonuSatirNo = haftaIciSatirNo + 1;

    personeller.forEach((_, colIdx) => {
      const colLetter = colIndexToLetter(colIdx + 2);

      let haftaIciDizilim = haftaIciGruplar
        .map(g => g.start === g.end ? `${colLetter}${g.start}` : `${colLetter}${g.start}:${colLetter}${g.end}`)
        .join(";");
      satirHaftaIci.push(haftaIciDizilim ? `=TOPLA(${haftaIciDizilim})` : 0);

      let ozelGunDizilim = ozelGunSatirlari.map(s => `${colLetter}${s}`).join(";");
      satirHaftaSonu.push(ozelGunDizilim ? `=TOPLA(${ozelGunDizilim})` : 0);

      satirToplam.push(`=TOPLA(${colLetter}${haftaIciSatirNo}:${colLetter}${haftaSonuSatirNo})`);
    });

    matrisVeri.push(satirHaftaIci);
    matrisVeri.push(satirHaftaSonu);
    matrisVeri.push(satirToplam);

    const ws = XLSX.utils.aoa_to_sheet(matrisVeri);
    const wb = XLSX.utils.book_new();
    const ayAdlariBuyuk = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];
    XLSX.utils.book_append_sheet(wb, ws, `${ayAdlariBuyuk[ay]} MESAİ LİSTESİ`);

    let dosyaTarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
    XLSX.writeFile(wb, `Mesai_Sablona_Gore_${dosyaTarih}.xlsx`);
    toast("Excel dosyası başarıyla hazırlandı! (Pazar ve resmi tatiller hafta sonu mesaisine dahil edildi)");
  } catch (err) {
    toast("Hata: " + err.message, true);
  }
}

function colIndexToLetter(index) {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}


// Telefon kamerasıyla barkod / QR okutma modalı
// kaynak: "stokkart" -> Stok Girişi'nde stok kartları arasında malzeme_kodu ile arar
//         "envanter" -> Stok Çıkışı'nda mevcut envanter kayıtları arasında malzeme_kodu ile arar
function barkodKamerasiAc(hedefInputId, kaynak = "stokkart") {
  const eski = document.getElementById("barkodModal");
  if (eski) eski.remove();

  const modalHtml = `
    <div id="barkodModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(18,24,31,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; padding: 16px;">
      <div style="background: var(--paper-2); padding: 20px; border-radius: var(--radius); width: 100%; max-width: 400px; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,0.35);">
        <h3 style="margin: 0 0 6px; color: var(--text); font-size: 16px;">📷 Barkodu Kameraya Tutun</h3>
        <div id="barkodDurum" style="font-size: 12px; color: var(--text-mute); margin-bottom: 12px;">Kamera açılıyor...</div>
        <div id="reader" style="width: 100%; border-radius: 6px; overflow: hidden; background: #000;"></div>
        <button id="barkodKapatBtn" class="btn btn-danger-outline btn-block" style="margin-top: 15px;">Kapat</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const durumEl = document.getElementById("barkodDurum");
  const html5QrCode = new Html5Qrcode("reader");
  let kapandi = false;

  const modaliKapat = () => {
    if (kapandi) return;
    kapandi = true;
    html5QrCode.stop().catch(() => {}).finally(() => {
      document.getElementById("barkodModal")?.remove();
    });
  };

  const taramaBasarili = async (decodedText) => {
    if (kapandi) return;
    kapandi = true;
    await html5QrCode.stop().catch(() => {});
    document.getElementById("barkodModal")?.remove();

    const kod = decodedText.trim();
    const inputEl = document.getElementById(hedefInputId);
    if (!inputEl) return;

    try {
      const liste = await api("GET", kaynak === "envanter" ? "/api/envanter" : "/api/stok-kartlari");
      const bulunan = liste.find(k => String(k.malzeme_kodu || "").trim().toLowerCase() === kod.toLowerCase());

      if (bulunan) {
        inputEl.value = bulunan.malzeme_adi;
        inputEl.dispatchEvent(new Event("input"));
        toast(`Barkod okundu: ${bulunan.malzeme_adi}`);
      } else {
        toast(`"${kod}" koduna sahip bir ürün bulunamadı. Önce Stok Kartları'ndan tanımlayın.`, true);
      }
    } catch (err) {
      toast("Ürün aranırken hata oluştu: " + err.message, true);
    }
  };

  const kameraBaslat = (cameraIdOrConfig) => html5QrCode.start(
    cameraIdOrConfig,
    { fps: 10, qrbox: { width: 260, height: 140 } },
    taramaBasarili,
    () => {} // tarama sırasında oluşan "bulunamadı" karesi hataları yoksayılır
  );



  // 1) Önce doğrudan arka kamerayı iste (mobil tarayıcılarda en güvenilir yöntem)
  kameraBaslat({ facingMode: "environment" })
    .then(() => { if (durumEl) durumEl.textContent = "Barkodu kutunun içine hizalayın."; })
    .catch(() => {
      // 2) Olmazsa kamera listesini çekip arka kamerayı manuel seçmeyi dene
      Html5Qrcode.getCameras().then(cameras => {
        if (!cameras || !cameras.length) {
          toast("Cihazda kamera bulunamadı!", true);
          modaliKapat();
          return;
        }
        const arkaKamera = cameras.find(c => /back|arka|environment|rear/i.test(c.label || ""));
        const secilenId = (arkaKamera || cameras[cameras.length - 1]).id;
        kameraBaslat(secilenId)
          .then(() => { if (durumEl) durumEl.textContent = "Barkodu kutunun içine hizalayın."; })
          .catch(err => {
            toast("Kamera başlatılamadı: " + err, true);
            modaliKapat();
          });
      }).catch(err => {
        toast("Kamera izni alınamadı: " + err, true);
        modaliKapat();
      });
    });

  document.getElementById("barkodKapatBtn").onclick = modaliKapat;
}

/* DEPOKONTROL — Stok girişine kamera düğmesi ekler.
 * Mevcut stok çıkışı kamera düğmesiyle de uyumludur.
 * Barkod, stok kartındaki malzeme_kodu ile eşleştirilir.
 * Stok kaydını otomatik oluşturmaz.
 */
(() => {
  "use strict";

  if (window.__depoKameraEklentisi) return;
  window.__depoKameraEklentisi = true;

  let yukleme;
  let oturum = null;

  function okuyucuYukle() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (yukleme) return yukleme;

    yukleme = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";

      script.async = true;

      const timer = setTimeout(() => {
        bitir(
          new Error(
            "Barkod okuyucusu yüklenemedi. İnternet bağlantısını kontrol edip yeniden deneyin."
          )
        );
      }, 15000);

      function bitir(hata) {
        clearTimeout(timer);
        script.onload = script.onerror = null;

        if (hata) {
          script.remove();
          reject(hata);
        } else {
          resolve();
        }
      }

      script.onload = () => {
        bitir(
          window.Html5Qrcode
            ? null
            : new Error("Barkod okuyucusu başlatılamadı.")
        );
      };

      script.onerror = () => {
        bitir(
          new Error(
            "Barkod okuyucusu indirilemedi. İnternet bağlantısını veya sitenin içerik izinlerini kontrol edin."
          )
        );
      };

      document.head.appendChild(script);
    }).catch(err => {
      yukleme = null;
      throw err;
    });

    return yukleme;
  }

  function hataMesaji(err) {
    const mesaj =
      String(err?.name || "") +
      " " +
      String(err?.message || err || "");

    if (/NotAllowed|PermissionDenied|permission denied/i.test(mesaj)) {
      return "Kamera izni verilmedi. Adres çubuğundaki site izinlerinden kameraya izin verip tekrar deneyin.";
    }

    if (/NotFound|DevicesNotFound/i.test(mesaj)) {
      return "Kamera bulunamadı. Kameranın bağlı ve açık olduğunu kontrol edin.";
    }

    if (/NotReadable|TrackStart|could not start video/i.test(mesaj)) {
      return "Kamera başka bir uygulama tarafından kullanılıyor veya açılamıyor. Diğer kamera uygulamalarını kapatıp tekrar deneyin.";
    }

    if (/Overconstrained|ConstraintNotSatisfied/i.test(mesaj)) {
      return "Seçilen kamera açılamadı. Başka bir kamera seçin.";
    }

    return (
      err?.message ||
      "Kamera açılamadı. Kamera izinlerini ve tarayıcı desteğini kontrol edin."
    );
  }

  function butonEkle() {
    const input = document.getElementById("sg_malzeme");

    if (!input || document.getElementById("stokGirisKameraButonu")) {
      return;
    }

    const button = document.createElement("button");

    button.id = "stokGirisKameraButonu";
    button.type = "button";
    button.textContent = "📷";
    button.title = "Kamerayla barkod / QR okut";

    button.setAttribute(
      "aria-label",
      "Malzeme barkodunu kamerayla okut"
    );

    button.style.cssText = `
      flex: 0 0 40px;
      width: 40px;
      height: 40px;
      border: 1px solid #d4d8dc;
      border-radius: 8px;
      background: #fff;
      color: #253440;
      font-size: 19px;
      cursor: pointer;
    `;

    input.style.minWidth = "0";
    input.parentElement.style.display = "flex";
    input.parentElement.style.alignItems = "center";
    input.parentElement.style.gap = "8px";

    input.insertAdjacentElement("afterend", button);

    button.addEventListener("click", () => {
      window.barkodKamerasiAc(input.id, "stokkart");
    });
  }

  window.barkodKamerasiAc = async function (
    hedefInputId,
    kaynak = "stokkart"
  ) {
    if (oturum) return;

    const hedef = document.getElementById(hedefInputId);
    if (!hedef) return;

    if (!window.isSecureContext) {
      toast(
        "Kamera için siteyi güvenilir HTTPS bağlantısıyla açın. Telefonlarda HTTP veya yerel IP üzerinden HTTP bağlantısı yeterli değildir.",
        true
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast(
        "Bu tarayıcı kamera erişimini desteklemiyor. Güncel bir tarayıcıyla deneyin.",
        true
      );
      return;
    }

    const dialog = document.createElement("dialog");

    dialog.id = "depoKameraDialog";

    dialog.setAttribute(
      "aria-labelledby",
      "depoKameraBaslik"
    );

    dialog.style.cssText = `
      width: min(480px, calc(100% - 28px));
      max-height: 90dvh;
      overflow: auto;
      padding: 22px;
      border: 1px solid #d6dce0;
      border-radius: 16px;
      background: white;
      color: #24333f;
      box-shadow: 0 20px 80px #0006;
    `;

    dialog.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:14px;
      ">
        <h2 id="depoKameraBaslik"
            style="font-size:18px;margin:0">
          Barkod / QR okut
        </h2>

        <button
          type="button"
          data-kapat
          aria-label="Kamerayı kapat"
          style="
            width:36px;
            height:36px;
            border:1px solid #ccc;
            background:#fff;
            border-radius:8px;
            cursor:pointer;
          "
        >✕</button>
      </div>

      <p
        data-durum
        role="status"
        aria-live="polite"
        style="font-size:13px;line-height:1.6"
      >
        Kamera hazırlanıyor…
      </p>

      <div
        id="depoKameraReader"
        style="
          width:100%;
          overflow:hidden;
          border-radius:10px;
          background:#f3f5f7;
        "
      ></div>

      <label
        for="depoKameraSecim"
        style="
          display:block;
          font-size:12px;
          margin:16px 0 6px;
        "
      >
        Kamera seçimi
      </label>

      <select
        id="depoKameraSecim"
        disabled
        style="
          width:100%;
          padding:10px;
          border:1px solid #ccc;
          border-radius:8px;
        "
      >
        <option>Kamera hazırlanıyor…</option>
      </select>

      <button
        type="button"
        data-tekrar
        hidden
        style="
          margin-top:12px;
          padding:10px 15px;
          border:0;
          border-radius:8px;
          background:#263b49;
          color:white;
          cursor:pointer;
        "
      >
        Tekrar dene
      </button>

      <p style="
        font-size:12px;
        color:#63717c;
        line-height:1.6;
        margin:15px 0 0;
      ">
        Barkodu iyi ışıkta, tamamı görünecek şekilde kameraya
        tutun. Okunan kod stok kartındaki malzeme koduyla
        eşleşmelidir.
      </p>
    `;

    document.body.appendChild(dialog);

    const mesaj = dialog.querySelector("[data-durum]");
    const kamera = dialog.querySelector("select");
    const tekrar = dialog.querySelector("[data-tekrar]");

    const s = {
      kapali: false,
      okundu: false,
      reader: null,
      islem: Promise.resolve(),
      hedef,
      dialog
    };

    oturum = s;

    const oncekiOdak = document.activeElement;

    function donanimDurdur() {
      dialog.querySelectorAll("video").forEach(video => {
        video.srcObject?.getTracks?.().forEach(track => {
          track.stop();
        });
      });
    }

    async function durdur() {
      if (s.reader?.isScanning) {
        try {
          await s.reader.stop();
        } catch {
          donanimDurdur();
        }
      }

      donanimDurdur();
    }

    function kapat() {
      if (s.kapali) return s.islem;

      s.kapali = true;
      dialog.close();
      donanimDurdur();

      document.removeEventListener(
        "visibilitychange",
        gizlenme
      );

      window.removeEventListener("pagehide", kapat);

      s.islem = s.islem.catch(() => {}).then(async () => {
        await durdur();

        try {
          s.reader?.clear();
        } catch {}

        dialog.remove();

        if (oturum === s) {
          oturum = null;
        }
      });

      if (oncekiOdak?.isConnected) {
        oncekiOdak.focus();
      }

      return s.islem;
    }

    function gizlenme() {
      if (document.hidden) kapat();
    }

    dialog.querySelector("[data-kapat]").onclick = kapat;

    dialog.addEventListener("cancel", e => {
      e.preventDefault();
      kapat();
    });

    dialog.addEventListener("close", () => {
      if (!s.kapali) kapat();
    });

    document.addEventListener(
      "visibilitychange",
      gizlenme
    );

    window.addEventListener("pagehide", kapat);

    dialog.showModal();

    async function listele() {
      try {
        const cihazlar = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter(d => {
          return d.kind === "videoinput" && d.deviceId;
        });

        if (s.kapali || !cihazlar.length) return;

        const aktifId = dialog
          .querySelector("video")
          ?.srcObject
          ?.getVideoTracks?.()[0]
          ?.getSettings?.()
          .deviceId;

        kamera.replaceChildren(
          ...cihazlar.map((d, i) => {
            return new Option(
              d.label || `Kamera ${i + 1}`,
              d.deviceId
            );
          })
        );

        if (cihazlar.some(d => d.deviceId === aktifId)) {
          kamera.value = aktifId;
        }
      } catch {
        // Kamera çalışıyorsa liste hatası taramayı kesmez.
      }
    }

    async function eslestir(metin) {
      if (s.kapali || s.okundu) return;

      s.okundu = true;

      const kod = String(metin).trim();

      mesaj.textContent =
        "Barkod okundu. Malzeme aranıyor…";

      // Başlatma tamamlandıktan sonra kamerayı durdur.
      s.islem = s.islem.catch(() => {}).then(durdur);

      try {
        await s.islem;

        if (s.kapali) return;

        const liste = await api(
          "GET",
          kaynak === "envanter"
            ? "/api/envanter"
            : "/api/stok-kartlari"
        );

        if (s.kapali) return;

        if (!Array.isArray(liste)) {
          throw new Error("Malzeme listesi alınamadı.");
        }

        const eslesenler = liste.filter(k => {
          return (
            String(k.malzeme_kodu ?? "").trim() === kod
          );
        });

        if (!eslesenler.length) {
          throw new Error(
            `“${kod}” malzeme koduna ait kayıt bulunamadı. Stok kartındaki malzeme kodunu kontrol edin.`
          );
        }

        if (
          kaynak !== "envanter" &&
          eslesenler.length !== 1
        ) {
          throw new Error(
            "Bu barkod birden fazla stok kartıyla eşleşiyor. Kartları kontrol edin."
          );
        }

        if (
          kaynak === "envanter" &&
          new Set(
            eslesenler.map(k => k.malzeme_adi)
          ).size !== 1
        ) {
          throw new Error(
            "Bu kod farklı malzemelerle eşleşiyor. Envanter kayıtlarını kontrol edin."
          );
        }

        if (
          !hedef.isConnected ||
          document.getElementById(hedefInputId) !== hedef
        ) {
          kapat();
          return;
        }

        const bulunan = eslesenler[0];

        hedef.value = bulunan.malzeme_adi;

        hedef.dispatchEvent(
          new Event("input", { bubbles: true })
        );

        if (kaynak !== "envanter") {
          const form = hedef.closest("form");

          for (const alan of [
            "malzeme_kodu",
            "raf_adresi",
            "birim",
            "kategori"
          ]) {
            const el = form?.elements.namedItem(alan);
            if (!el) continue;

            const deger = String(bulunan[alan] ?? "");

            if (
              el.tagName === "SELECT" &&
              deger &&
              !Array.from(el.options).some(o => {
                return o.value === deger;
              })
            ) {
              el.add(new Option(deger, deger));
            }

            el.value = deger;

            el.dispatchEvent(
              new Event("change", { bubbles: true })
            );
          }
        }

        await kapat();

        toast(
          `Malzeme seçildi: ${bulunan.malzeme_adi}. Miktar ve diğer bilgileri girip kaydedin.`
        );
      } catch (err) {
        if (!s.kapali) {
          mesaj.textContent =
            err.message ||
            "Malzeme aranırken hata oluştu.";

          tekrar.hidden = false;
        }
      }
    }

    function baslat(cameraId) {
      kamera.disabled = true;
      tekrar.hidden = true;

      s.islem = s.islem.catch(() => {}).then(async () => {
        if (s.kapali) return;

        try {
          await okuyucuYukle();
          if (s.kapali) return;

          await durdur();
          if (s.kapali) return;

          s.okundu = false;

          s.reader ||= new Html5Qrcode(
            "depoKameraReader",
            { verbose: false }
          );

          mesaj.textContent =
            "Kamera açılıyor. İzin sorulursa kameraya izin verin.";

          // Tam görüntü taranır; uzun barkodlar kırpılmaz.
          const config = { fps: 10 };

          try {
            await s.reader.start(
              cameraId || { facingMode: "environment" },
              config,
              eslestir,
              () => {}
            );
          } catch (err) {
            if (
              cameraId ||
              s.kapali ||
              !/NotFound|Overconstrained|ConstraintNotSatisfied/i.test(
                String(err)
              )
            ) {
              throw err;
            }

            await s.reader.start(
              { facingMode: "user" },
              config,
              eslestir,
              () => {}
            );
          }

          if (s.kapali) {
            await durdur();
            return;
          }

          await listele();

          if (!s.okundu) {
            mesaj.textContent =
              "Barkodu kameraya tutun. Uygun kamera için aşağıdaki listeden seçim yapabilirsiniz.";
          }
        } catch (err) {
          await durdur();

          if (!s.kapali) {
            mesaj.textContent = hataMesaji(err);
            tekrar.hidden = false;
          }
        } finally {
          if (!s.kapali) {
            kamera.disabled =
              !kamera.options[0]?.value ||
              kamera.options[0]?.text ===
                "Kamera hazırlanıyor…";
          }
        }
      });
    }

    kamera.onchange = () => {
      baslat(kamera.value);
    };

    tekrar.onclick = () => {
      baslat(
        kamera.disabled ? undefined : kamera.value
      );
    };

    baslat();
  };

  function kur() {
    butonEkle();

    const body = document.getElementById("viewBody");
    if (!body) return;

    new MutationObserver(() => {
      butonEkle();

      // Ekran değiştiğinde kamerayı kapat.
      if (oturum && !oturum.hedef.isConnected) {
        oturum.dialog.close();
      }
    }).observe(body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      kur,
      { once: true }
    );
  } else {
    kur();
  }
})();

// DEPO_BARKOD_V2_APP_BEGIN
;(() => {
  "use strict";

  if (window.__depoBarkodV2) return;
  window.__depoBarkodV2 = true;

  let yukleme;
  let oturum = null;

  function okuyucuYukle() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (yukleme) return yukleme;

    yukleme = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
      script.async = true;

      const timer = setTimeout(() => {
        bitir(new Error("Barkod okuyucusu yüklenemedi. İnternet bağlantınızı kontrol edin."));
      }, 15000);

      function bitir(hata) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (hata) {
          script.remove();
          reject(hata);
        } else {
          resolve();
        }
      }

      script.onload = () => {
        bitir(window.Html5Qrcode ? null : new Error("Barkod okuyucusu başlatılamadı."));
      };

      script.onerror = () => {
        bitir(new Error("Barkod okuyucusu indirilemedi. Bağlantınızı kontrol edin."));
      };

      document.head.appendChild(script);
    }).catch(err => {
      yukleme = null;
      throw err;
    });

    return yukleme;
  }

  function hataMesaji(err) {
    const mesaj = String(err?.name || "") + " " + String(err?.message || err || "");
    if (/NotAllowed|PermissionDenied|permission denied/i.test(mesaj)) {
      return "Kamera izni verilmedi. Site izinlerinden kameraya izin verin.";
    }
    if (/NotFound|DevicesNotFound/i.test(mesaj)) {
      return "Kamera bulunamadı.";
    }
    if (/NotReadable|TrackStart|could not start video/i.test(mesaj)) {
      return "Kamera başka bir uygulama tarafından kullanılıyor.";
    }
    return err?.message || "Kamera açılamadı.";
  }

  function butonEkle() {
    const input = document.getElementById("sg_malzeme");
    if (!input || document.getElementById("stokGirisKameraButonu")) return;

    const button = document.createElement("button");
    button.id = "stokGirisKameraButonu";
    button.type = "button";
    button.textContent = "📷";
    button.title = "Kamerayla barkod / QR okut";
    button.style.cssText = "flex:0 0 40px;width:40px;height:40px;border:1px solid #d4d8dc;border-radius:8px;background:#fff;color:#253440;font-size:19px;cursor:pointer;";

    input.style.minWidth = "0";
    input.parentElement.style.display = "flex";
    input.parentElement.style.alignItems = "center";
    input.parentElement.style.gap = "8px";
    input.insertAdjacentElement("afterend", button);

    button.addEventListener("click", () => {
      window.barkodKamerasiAc(input.id, "stokkart");
    });
  }

  window.barkodKamerasiAc = async function(hedefInputId, kaynak = "stokkart") {
    if (oturum) return;
    const hedef = document.getElementById(hedefInputId);
    if (!hedef) return;

    if (!window.isSecureContext) {
      toast("Kamera için siteyi güvenilir HTTPS bağlantısıyla açın.", true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Tarayıcınız kamera erişimini desteklemiyor.", true);
      return;
    }

    const dialog = document.createElement("dialog");
    dialog.id = "depoKameraDialog";
    dialog.setAttribute("aria-labelledby", "depoKameraBaslik");
    dialog.style.cssText = "width:min(480px,calc(100% - 28px));max-height:90dvh;overflow:auto;padding:22px;border:1px solid #d6dce0;border-radius:16px;background:white;color:#24333f;box-shadow:0 20px 80px #0006;";

    dialog.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <h2 id="depoKameraBaslik" style="font-size:18px;margin:0">Barkod / QR okut</h2>
        <button type="button" data-kapat style="width:36px;height:36px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">✕</button>
      </div>
      <p data-durum style="font-size:13px;line-height:1.6">Kamera hazırlanıyor…</p>
      <div id="depoKameraReader" style="width:100%;overflow:hidden;border-radius:10px;background:#f3f5f7"></div>
      <label for="depoKameraSecim" style="display:block;font-size:12px;margin:16px 0 6px">Kamera seçimi</label>
      <select id="depoKameraSecim" disabled style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">
        <option>Kamera hazırlanıyor…</option>
      </select>
      <button type="button" data-tekrar hidden style="margin-top:12px;padding:10px 15px;border:0;border-radius:8px;background:#263b49;color:white;cursor:pointer">Tekrar dene</button>
    `;

    document.body.appendChild(dialog);
    const mesaj = dialog.querySelector("[data-durum]");
    const kamera = dialog.querySelector("select");
    const tekrar = dialog.querySelector("[data-tekrar]");
    const s = { kapali: false, okundu: false, reader: null, islem: Promise.resolve(), hedef, dialog };
    oturum = s;
    const oncekiOdak = document.activeElement;

    function donanimDurdur() {
      dialog.querySelectorAll("video").forEach(video => {
        video.srcObject?.getTracks?.().forEach(track => track.stop());
      });
    }

    async function durdur() {
      if (s.reader?.isScanning) {
        try { await s.reader.stop(); } catch { donanimDurdur(); }
      }
      donanimDurdur();
    }

    function kapat() {
      if (s.kapali) return s.islem;
      s.kapali = true;
      dialog.close();
      donanimDurdur();
      document.removeEventListener("visibilitychange", gizlenme);
      window.removeEventListener("pagehide", kapat);
      s.islem = s.islem.catch(() => {}).then(async () => {
        await durdur();
        try { s.reader?.clear(); } catch {}
        dialog.remove();
        if (oturum === s) oturum = null;
      });
      if (oncekiOdak?.isConnected) oncekiOdak.focus();
      return s.islem;
    }

    function gizlenme() { if (document.hidden) kapat(); }
    dialog.querySelector("[data-kapat]").onclick = kapat;
    dialog.addEventListener("cancel", e => { e.preventDefault(); kapat(); });
    dialog.addEventListener("close", () => { if (!s.kapali) kapat(); });
    document.addEventListener("visibilitychange", gizlenme);
    window.addEventListener("pagehide", kapat);
    dialog.showModal();

    async function listele() {
      try {
        const cihazlar = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput" && d.deviceId);
        if (s.kapali || !cihazlar.length) return;
        const aktifId = dialog.querySelector("video")?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().deviceId;
        kamera.replaceChildren(...cihazlar.map((d, i) => new Option(d.label || `Kamera ${i + 1}`, d.deviceId)));
        if (cihazlar.some(d => d.deviceId === aktifId)) kamera.value = aktifId;
      } catch {}
    }

    async function eslestir(metin) {
      if (s.kapali || s.okundu) return;
      s.okundu = true;
      const kod = String(metin).trim();
      mesaj.textContent = "Barkod okundu. Malzeme aranıyor…";
      s.islem = s.islem.catch(() => {}).then(durdur);

      try {
        await s.islem;
        if (s.kapali) return;
        if (!kod || kod.length > 256) throw new Error("Geçerli bir barkod okutun.");

        if (kaynak === "tanimla") {
          hedef.value = kod;
          hedef.dispatchEvent(new Event("input", { bubbles: true }));
          await kapat();
          toast("Barkod okundu. Kaydet düğmesine basın.");
          return;
        }

        const liste = await api("GET", kaynak === "envanter" ? "/api/envanter" : "/api/stok-kartlari");
        if (s.kapali) return;

        const eslesenler = (Array.isArray(liste) ? liste : []).filter(k => String(k.malzeme_kodu ?? "").trim() === kod);
        if (!eslesenler.length) throw new Error(`“${kod}” koduna ait kayıt bulunamadı.`);

        const bulunan = eslesenler[0];
        hedef.value = bulunan.malzeme_adi;
        hedef.dispatchEvent(new Event("input", { bubbles: true }));

        if (kaynak !== "envanter") {
          const form = hedef.closest("form");
          for (const alan of ["malzeme_kodu", "raf_adresi", "birim", "kategori"]) {
            const el = form?.elements.namedItem(alan);
            if (!el) continue;
            const deger = String(bulunan[alan] ?? "");
            if (el.tagName === "SELECT" && deger && !Array.from(el.options).some(o => o.value === deger)) {
              el.add(new Option(deger, deger));
            }
            el.value = deger;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        await kapat();
        toast(`Malzeme seçildi: ${bulunan.malzeme_adi}`);
      } catch (err) {
        if (!s.kapali) {
          mesaj.textContent = err.message || "Hata oluştu.";
          tekrar.hidden = false;
        }
      }
    }

    function baslat(cameraId) {
      kamera.disabled = true;
      tekrar.hidden = true;
      s.islem = s.islem.catch(() => {}).then(async () => {
        if (s.kapali) return;
        try {
          await okuyucuYukle();
          if (s.kapali) return;
          await durdur();
          if (s.kapali) return;
          s.okundu = false;
          s.reader ||= new Html5Qrcode("depoKameraReader", { verbose: false });
          mesaj.textContent = "Kamera açılıyor…";
          const config = { fps: 10 };
          try {
            await s.reader.start(cameraId || { facingMode: "environment" }, config, eslestir, () => {});
          } catch (err) {
            if (cameraId || s.kapali || !/NotFound|Overconstrained|ConstraintNotSatisfied/i.test(String(err))) throw err;
            await s.reader.start({ facingMode: "user" }, config, eslestir, () => {});
          }
          if (s.kapali) { await durdur(); return; }
          await listele();
          if (!s.okundu) mesaj.textContent = "Barkodu kameraya tutun.";
        } catch (err) {
          await durdur();
          if (!s.kapali) {
            mesaj.textContent = hataMesaji(err);
            tekrar.hidden = false;
          }
        } finally {
          if (!s.kapali) {
            kamera.disabled = !kamera.options[0]?.value || kamera.options[0]?.text === "Kamera hazırlanıyor…";
          }
        }
      });
    }

    kamera.onchange = () => baslat(kamera.value);
    tekrar.onclick = () => baslat(kamera.disabled ? undefined : kamera.value);
    baslat();
  };

  function tanimlamaEkraniEkle() {
    const stokForm = document.getElementById("stokKartiForm");
    if (!stokForm || document.getElementById("barkodTanimlamaKart")) return;
    if (!["yonetici", "depopersoneli"].includes(state.role)) return;

    const panel = document.createElement("section");
    panel.id = "barkodTanimlamaKart";
    panel.className = "card";
    panel.style.marginBottom = "20px";

    panel.innerHTML = `
      <div class="section-title">Barkod Tanımla</div>
      <p style="font-size:13px;color:#63717c;line-height:1.6;margin:0 0 16px">Mevcut stok kartını seçin; ürünün üzerindeki barkodu yazın veya kamerayla okutun.</p>
      <form id="barkodTanimlamaForm">
        <fieldset style="border:0;padding:0;margin:0;min-width:0" disabled>
          <div class="form-grid">
            <div class="field">
              <label for="bkArama">Ürün ara</label>
              <input id="bkArama" type="search" placeholder="Malzeme kodu, adı veya barkod">
            </div>
            <div class="field">
              <label for="bkKart">Stok kartı *</label>
              <select id="bkKart" required><option value="">Yükleniyor…</option></select>
            </div>
            <div class="field span-2">
              <label for="bkDeger">Ürünün barkodu</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="bkDeger" type="text" maxlength="256" autocomplete="off" spellcheck="false" placeholder="Örn: 008691234567890" style="flex:1;min-width:0">
                <button type="button" id="bkKamera" aria-label="Tanımlanacak barkodu kamerayla okut" title="Barkodu kamerayla okut" style="flex:0 0 42px;height:42px;border:1px solid #ccc;border-radius:8px;background:white;font-size:20px;cursor:pointer">📷</button>
              </div>
            </div>
          </div>
          <p id="bkMevcut" style="font-size:13px;line-height:1.6;margin:10px 0">Önce stok kartını seçin.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary">Barkodu Kaydet</button>
            <button type="button" id="bkKaldir" class="btn btn-danger-outline">Eşleştirmeyi Kaldır</button>
          </div>
        </fieldset>
      </form>
      <p id="bkDurum" role="status" aria-live="polite" style="font-size:13px;line-height:1.6;margin:12px 0 0">Stok kartları yükleniyor…</p>
      <button type="button" id="bkYenile" class="btn btn-sm" style="margin-top:10px">Listeyi Yenile</button>
    `;

    const grid = stokForm.closest(".grid");
    (grid || stokForm.closest(".card")).before(panel);

    const bul = id => panel.querySelector("#" + id);
    const form = bul("barkodTanimlamaForm");
    const alanlar = form.querySelector("fieldset");
    const kartSecim = bul("bkKart");
    const barkodInput = bul("bkDeger");
    const mesaj = bul("bkDurum");
    const yenile = bul("bkYenile");

    let kartlar = [];
    let mesgul = false;

    const seciliKart = () => kartlar.find(k => String(k.id) === kartSecim.value);

    function bilgiGoster() {
      const kart = seciliKart();
      barkodInput.value = String(kart?.barkod ?? "").trim();
      bul("bkMevcut").textContent = kart
        ? `${kart.malzeme_kodu || "Kodsuz"} · ${kart.malzeme_adi} — Mevcut barkod: ${barkodInput.value || "Tanımlı değil"}`
        : "Önce stok kartını seçin.";
      bul("bkKaldir").disabled = !barkodInput.value;
      bul("bkKamera").disabled = !kart;
      barkodInput.disabled = !kart;
    }

    function filtrele(korunacak = kartSecim.value) {
      const arama = bul("bkArama").value.trim().toLocaleLowerCase("tr-TR");
      const liste = kartlar.filter(k => [k.malzeme_kodu, k.malzeme_adi, k.barkod].join(" ").toLocaleLowerCase("tr-TR").includes(arama));

      kartSecim.replaceChildren(
        new Option("Stok kartını seçin…", ""),
        ...liste.map(k => new Option(`${k.malzeme_kodu || "Kodsuz"} · ${k.malzeme_adi}${k.barkod ? " · " + k.barkod : ""}`, String(k.id)))
      );
      kartSecim.value = liste.some(k => String(k.id) === korunacak) ? korunacak : "";
      bilgiGoster();
    }

    async function yukle() {
      if (mesgul) return;
      mesgul = true;
      alanlar.disabled = yenile.disabled = true;
      const secim = kartSecim.value;
      try {
        const liste = await api("GET", "/api/stok-kartlari");
        if (!panel.isConnected) return;
        if (!Array.isArray(liste)) throw new Error("Stok kartları alınamadı.");
        kartlar = liste;
        filtrele(secim);
        const tanimli = kartlar.filter(k => String(k.barkod ?? "").trim()).length;
        mesaj.textContent = `${kartlar.length} stok kartı · ${tanimli} barkod tanımlı`;
      } catch (err) {
        mesaj.textContent = err.message;
      } finally {
        mesgul = false;
        yenile.disabled = false;
        alanlar.disabled = !kartlar.length;
      }
    }

    async function kaydet(kaldir) {
      if (mesgul) return;
      const kart = seciliKart();
      if (!kart) { mesaj.textContent = "Önce bir stok kartı seçin."; return; }
      const deger = kaldir ? "" : barkodInput.value.trim();
      if (!kaldir && (!deger || deger.length > 256 || /[\x00-\x1f\x7f]/.test(deger))) {
        mesaj.textContent = "Geçerli bir barkod yazın veya kamerayla okutun.";
        return;
      }
      if (kaldir && !confirm(`${kart.malzeme_adi} ürününün barkod eşleştirmesi kaldırılsın mı?`)) return;

      mesgul = true;
      alanlar.disabled = yenile.disabled = true;
      mesaj.textContent = "Kaydediliyor…";
      try {
        const sonuc = await api("POST", `/api/stok-kartlari/${kart.id}/barkod`, {
          barkod: deger,
          onceki_barkod: String(kart.barkod ?? "").trim()
        });
        if (!panel.isConnected) return;
        
        // Esnek yanıt kontrolü (ok kontrolü esnetildi)
        kart.barkod = deger;
        bul("bkArama").value = "";
        filtrele(String(kart.id));
        const bilgiMsg = sonuc?.message || "Barkod başarıyla kaydedildi.";
        mesaj.textContent = bilgiMsg;
        toast(bilgiMsg);
      } catch (err) {
        mesaj.textContent = err.message;
        toast(err.message, true);
      } finally {
        mesgul = false;
        alanlar.disabled = yenile.disabled = false;
      }
    }

    form.onsubmit = e => { e.preventDefault(); kaydet(false); };
    bul("bkKaldir").onclick = () => kaydet(true);
    bul("bkKamera").onclick = () => window.barkodKamerasiAc("bkDeger", "tanimla");
    kartSecim.onchange = bilgiGoster;
    bul("bkArama").oninput = () => filtrele();
    yenile.onclick = yukle;
    yukle();
  }

  function kur() {
    butonEkle();
    tanimlamaEkraniEkle();
    const body = document.getElementById("viewBody");
    if (!body) return;
    new MutationObserver(() => {
      butonEkle();
      tanimlamaEkraniEkle();
      if (oturum && !oturum.hedef.isConnected) oturum.dialog.close();
    }).observe(body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", kur, { once: true });
  } else {
    kur();
  }
})();
// DEPO_BARKOD_V2_APP_END