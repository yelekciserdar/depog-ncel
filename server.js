// server.js — DEPOKONTROL Backend
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const db = new Database(path.join(__dirname, "depo.db"));
db.pragma("journal_mode = WAL");

// --- SSL Sertifikaları (isteğe bağlı) ---
let options = null;
try {
  options = {
    key: fs.readFileSync(process.env.SSL_KEY || "/root/server.key"),
    cert: fs.readFileSync(process.env.SSL_CERT || "/root/server.cert")
  };
} catch (e) {
  options = null;
}

// --- Veritabanı Tablolarını Oluşturma ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    salt TEXT,
    role TEXT
  );
  CREATE TABLE IF NOT EXISTS satinalma_talepleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_kodu TEXT,
    malzeme_adi TEXT,
    talep_miktari REAL,
    gelen_miktar REAL DEFAULT 0,
    birim TEXT,
    talep_eden TEXT,
    durum TEXT DEFAULT 'Bekliyor',
    grup_adi TEXT DEFAULT 'Genel Satın Alma',
    red_sebebi TEXT,
    termin_tarihi TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS tedarikci_teklifleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talep_id INTEGER,
    tedarikci_adi TEXT,
    birim_fiyat REAL,
    para_birimi TEXT DEFAULT 'TL',
    notlar TEXT,
    created_at TEXT,
    FOREIGN KEY(talep_id) REFERENCES satinalma_talepleri(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS envanter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_kodu TEXT,
    malzeme_adi TEXT,
    raf_adresi TEXT,
    miktar REAL,
    birim TEXT,
    kategori TEXT,
    lot_no TEXT,
    skt TEXT,
    barkod TEXT,
    uretim_tarihi TEXT
  );
  CREATE TABLE IF NOT EXISTS fatura_gecmisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_kodu TEXT,
    malzeme_tanim TEXT,
    miktar REAL,
    fatura_no TEXT,
    fatura_tarihi TEXT,
    birim_fiyati REAL,
    para_birimi TEXT,
    tedarikci TEXT,
    islemi_yapan TEXT,
    iptal INTEGER DEFAULT 0,
    created_at TEXT,
    kategori TEXT,
    lot_no TEXT,
    skt TEXT,
    uretim_tarihi TEXT
  );
  CREATE TABLE IF NOT EXISTS cikislar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_tanim TEXT,
    miktar REAL,
    tekne_no TEXT,
    teslim_edilen TEXT,
    raf_adresi TEXT,
    islemi_yapan TEXT,
    iptal INTEGER DEFAULT 0,
    created_at TEXT,
    lot_no TEXT,
    skt TEXT,
    uretim_tarihi TEXT
  );
  CREATE TABLE IF NOT EXISTS el_aletleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demirbas_no TEXT UNIQUE,
    marka TEXT,
    model TEXT,
    miktar REAL DEFAULT 1,
    seri_no TEXT,
    alis_tarihi TEXT,
    alis_fiyati REAL,
    kondisyon TEXT,
    durum TEXT DEFAULT 'STOKTA',
    aciklama TEXT
  );
  CREATE TABLE IF NOT EXISTS zimmet_gecmisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demirbas_no TEXT,
    marka TEXT,
    model TEXT,
    seri_no TEXT,
    zimmetlenen_kisi TEXT,
    teslim_tarihi TEXT,
    iade_eden TEXT,
    iade_tarihi TEXT,
    hurda_tarihi TEXT,
    kondisyon TEXT,
    aciklama TEXT,
    islemi_yapan TEXT
  );
  CREATE TABLE IF NOT EXISTS ayarlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tip TEXT,
    deger TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS tekne_uretim_asamalari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tekne_no TEXT,
    asama_adi TEXT,
    durum TEXT DEFAULT 'Bekliyor',
    ilerleme_yuzdesi INTEGER DEFAULT 0,
    notlar TEXT,
    model TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS stok_kartlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_kodu TEXT UNIQUE,
    malzeme_adi TEXT,
    kategori TEXT,
    birim TEXT,
    kritik_stok REAL DEFAULT 0,
    raf_adresi TEXT,
    aciklama TEXT,
    barkod TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS musteri_kartlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_adi TEXT UNIQUE,
    yetkili TEXT,
    telefon TEXT,
    eposta TEXT,
    adres TEXT,
    vergi_no TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS mesai_takip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personel_adi TEXT,
    tarih TEXT,
    mesai_suresi REAL,
    aciklama TEXT,
    islemi_yapan TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS cari_islemler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tedarikci_adi TEXT,
    islem_tipi TEXT,
    tutar REAL,
    para_birimi TEXT,
    kur REAL DEFAULT 1,
    tl_karsiligi REAL DEFAULT 0,
    islem_tarihi TEXT,
    belge_no TEXT,
    aciklama TEXT,
    islemi_yapan TEXT,
    created_at TEXT
  );
`);

// --- OTOMATİK VERİTABANI GÜNCELLEMESİ (Güvenli Kontrol) ---
const migrations = [
  "ALTER TABLE users ADD COLUMN password_hash TEXT",
  "ALTER TABLE users ADD COLUMN salt TEXT",
  "ALTER TABLE users ADD COLUMN role TEXT",
  "ALTER TABLE satinalma_talepleri ADD COLUMN grup_adi TEXT DEFAULT 'Genel Satın Alma'",
  "ALTER TABLE satinalma_talepleri ADD COLUMN gelen_miktar REAL DEFAULT 0",
  "ALTER TABLE satinalma_talepleri ADD COLUMN red_sebebi TEXT",
  "ALTER TABLE satinalma_talepleri ADD COLUMN termin_tarihi TEXT",
  "ALTER TABLE envanter ADD COLUMN kategori TEXT",
  "ALTER TABLE envanter ADD COLUMN lot_no TEXT",
  "ALTER TABLE envanter ADD COLUMN skt TEXT",
  "ALTER TABLE envanter ADD COLUMN barkod TEXT",
  "ALTER TABLE envanter ADD COLUMN uretim_tarihi TEXT",
  "ALTER TABLE fatura_gecmisi ADD COLUMN kategori TEXT",
  "ALTER TABLE fatura_gecmisi ADD COLUMN lot_no TEXT",
  "ALTER TABLE fatura_gecmisi ADD COLUMN skt TEXT",
  "ALTER TABLE fatura_gecmisi ADD COLUMN uretim_tarihi TEXT",
  "ALTER TABLE cikislar ADD COLUMN lot_no TEXT",
  "ALTER TABLE cikislar ADD COLUMN skt TEXT",
  "ALTER TABLE cikislar ADD COLUMN uretim_tarihi TEXT",
  "ALTER TABLE cari_islemler ADD COLUMN kur REAL DEFAULT 1",
  "ALTER TABLE cari_islemler ADD COLUMN tl_karsiligi REAL DEFAULT 0",
  "ALTER TABLE cari_islemler ADD COLUMN islemi_yapan TEXT",
  "ALTER TABLE cari_islemler ADD COLUMN created_at TEXT",
  "ALTER TABLE tekne_uretim_asamalari ADD COLUMN model TEXT",
  "ALTER TABLE stok_kartlari ADD COLUMN barkod TEXT"
];

migrations.forEach(sql => {
  try { db.exec(sql + ";"); } catch (err) {}
});


// Tek ürün kodu = tek ürün adı. Raf/lot bu eşleştirmeyi değiştirmez.
function kimlikMetni(v) {
  return String(v ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");
}
function kodAnahtari(v) { return kimlikMetni(v).toUpperCase(); }
function adAnahtari(v) { return kimlikMetni(v).toLocaleUpperCase("tr-TR"); }
function kimlikHatasi(message) {
  const error = new Error(message);
  error.status = 409;
  throw error;
}
function urunKimlikleri() {
  return db.prepare(`
    SELECT malzeme_kodu, malzeme_adi FROM stok_kartlari
    UNION ALL SELECT malzeme_kodu, malzeme_adi FROM envanter
    UNION ALL SELECT malzeme_kodu, malzeme_tanim AS malzeme_adi FROM fatura_gecmisi
  `).all();
}
function kimlikDogrula(kod, ad, rows = urunKimlikleri()) {
  const cleanCode = kimlikMetni(kod), cleanName = kimlikMetni(ad);
  if (!cleanName) {
    const error = new Error("Malzeme adı boş bırakılamaz.");
    error.status = 400;
    throw error;
  }
  if (!cleanCode) return { malzeme_kodu: "", malzeme_adi: cleanName };
  const existing = rows.filter(r => kodAnahtari(r.malzeme_kodu) === kodAnahtari(cleanCode));
  const conflict = existing.find(r => adAnahtari(r.malzeme_adi) !== adAnahtari(cleanName));
  if (conflict) kimlikHatasi(`"${cleanCode}" kodu "${conflict.malzeme_adi}" adına kayıtlı. Aynı kod "${cleanName}" adıyla kullanılamaz. Raf adresi farklı olabilir; ürün adı aynı olmalıdır.`);
  return existing.length
    ? { malzeme_kodu: kimlikMetni(existing[0].malzeme_kodu), malzeme_adi: kimlikMetni(existing[0].malzeme_adi) }
    : { malzeme_kodu: cleanCode, malzeme_adi: cleanName };
}
function stokKartiSec(kod, ad) {
  const cards = db.prepare("SELECT * FROM stok_kartlari ORDER BY id").all();
  const matches = kimlikMetni(kod)
    ? cards.filter(r => kodAnahtari(r.malzeme_kodu) === kodAnahtari(kod))
    : cards.filter(r => adAnahtari(r.malzeme_adi) === adAnahtari(ad));
  if (!matches.length) {
    const error = new Error("Bu kod/ad için stok kartı bulunamadı. Önce stok kartını oluşturun.");
    error.status = 400; throw error;
  }
  if (matches.length > 1) kimlikHatasi("Birden fazla stok kartı eşleşiyor. Ürünü doğru malzeme koduyla seçin; mükerrer kartları kontrol edin.");
  if (adAnahtari(matches[0].malzeme_adi) !== adAnahtari(ad))
    kimlikHatasi(`"${kod}" kodunun kayıtlı adı "${matches[0].malzeme_adi}". Farklı ürün adı kabul edilmedi.`);
  kimlikDogrula(matches[0].malzeme_kodu, matches[0].malzeme_adi);
  return matches[0];
}

// Varsayılan Yönetici Hesabı
const adminCheck = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
if (!adminCheck) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync("111", salt, 1000, 64, "sha512").toString("hex");
  db.prepare("INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)").run("admin", hash, salt, "yonetici");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const password_hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return { password_hash, salt };
}

function verifyPassword(password, salt, storedHash) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === storedHash;
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function requireAuth(req, res, pathname, method) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendJSON(res, 401, { error: "Yetkisiz erişim. Oturum açın." });
    return null;
  }
  const token = authHeader.split(" ")[1];
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?").get(token, Date.now());
  if (!session) {
    sendJSON(res, 401, { error: "Oturum süresi dolmuş veya geçersiz." });
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);

  if (user.role === 'satinalma') {
    const isAllowed = pathname.startsWith('/api/satinalma') || 
                      pathname.startsWith('/api/cari') || 
                      pathname.startsWith('/api/musteri-kartlari') || 
                      pathname.startsWith('/api/stok-kartlari') || 
                      (pathname === '/api/envanter' && method === 'GET') ||
                      (pathname === '/api/ayarlar' && method === 'GET') ||
                      (pathname.startsWith('/api/rapor/'));
    if (!isAllowed) {
      sendJSON(res, 403, { error: "Erişim reddedildi." });
      return null;
    }
  }

  if (user.role === 'depopersoneli') {
    if (pathname.startsWith('/api/users') || pathname.startsWith('/api/cari') || pathname.startsWith('/api/musteri') || pathname.startsWith('/api/tekne-uretim')) {
      sendJSON(res, 403, { error: "Depo personelinin bu ekrana erişim yetkisi yoktur." });
      return null;
    }
  }

  if (user.role === 'personel') {
    const isDeleteAction = pathname.includes('/sil') || pathname.includes('/iptal') || method === 'DELETE';
    if (isDeleteAction) {
      sendJSON(res, 403, { error: "Erişim reddedildi." });
      return null;
    }
  }

  return { user, uid: user.id, username: user.username, role: user.role };
}

function num(v) {
  if (typeof v === "string") v = v.replace(/,/g, ".");
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// --- Sunucu Yönlendiricisi ---
async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (!pathname.startsWith("/api/")) {
    let filePath = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname);
    fs.readFile(filePath, (err, content) => {
      if (err) {
        fs.readFile(path.join(__dirname, "public", "index.html"), (err2, content2) => {
          if (err2) {
            res.writeHead(404);
            res.end("Sayfa bulunamadı");
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(content2);
          }
        });
      } else {
        const ext = path.extname(filePath);
        let contentType = "text/html";
        if (ext === ".js") contentType = "application/javascript";
        else if (ext === ".css") contentType = "text/css";
        else if (ext === ".json") contentType = "application/json";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      }
    });
    return;
  }

  // --- API ROTALARI ---

  if (pathname === "/api/auth/login" && method === "POST") {
    const b = await readBody(req);
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(b.username);
    if (!user || !verifyPassword(b.password, user.salt, user.password_hash)) {
      return sendJSON(res, 401, { error: "Geçersiz kullanıcı adı veya şifre." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = Date.now() + 24 * 60 * 60 * 1000;
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expires_at);
    return sendJSON(res, 200, { token, username: user.username, role: user.role });
  }

  // --- MESAİ TAKİP MODÜLÜ ---
  if (pathname === "/api/mesai" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const rows = db.prepare("SELECT * FROM mesai_takip ORDER BY tarih DESC, id DESC").all();
    return sendJSON(res, 200, rows);
  }

  if (pathname === "/api/mesai" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    if (!b.personel_adi || !b.tarih || b.mesai_suresi === undefined) {
      return sendJSON(res, 400, { error: "Personel adı, tarih ve mesai süresi zorunludur." });
    }
    try {
      db.prepare(`
        INSERT INTO mesai_takip (personel_adi, tarih, mesai_suresi, aciklama, islemi_yapan, created_at) 
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(b.personel_adi, b.tarih, num(b.mesai_suresi), b.aciklama || "", auth.username);
      
      return sendJSON(res, 200, { ok: true, message: "Mesai başarıyla kaydedildi." });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (pathname.match(/^\/api\/mesai\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    try {
      db.prepare("DELETE FROM mesai_takip WHERE id = ?").run(id);
      return sendJSON(res, 200, { ok: true, message: "Mesai kaydı silindi." });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // 1. Stok Kartları
  if (pathname === "/api/stok-kartlari" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM stok_kartlari ORDER BY malzeme_adi ASC").all());
  }
  if (pathname === "/api/stok-kartlari/kod-kontrol" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    if (!Array.isArray(b.rows)) return sendJSON(res, 400, { error: "Satır listesi geçersiz." });
    const known = urunKimlikleri(), errors = [];
    for (let i = 0; i < b.rows.length; i++) {
      const row = b.rows[i] || {};
      try { known.push(kimlikDogrula(row.malzeme_kodu, row.malzeme_adi, known)); }
      catch (e) { errors.push({ row: row.excel_row || i + 2, error: e.message }); }
    }
    return sendJSON(res, 200, { ok: errors.length === 0, errors });
  }
  if (pathname === "/api/stok-kartlari" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    try {
      const result = db.transaction(() => {
        const identity = kimlikDogrula(b.malzeme_kodu, b.malzeme_adi);
        const cards = db.prepare("SELECT * FROM stok_kartlari ORDER BY id").all();
        const existing = cards.find(r => identity.malzeme_kodu
          ? kodAnahtari(r.malzeme_kodu) === kodAnahtari(identity.malzeme_kodu)
          : !kimlikMetni(r.malzeme_kodu) && adAnahtari(r.malzeme_adi) === adAnahtari(identity.malzeme_adi));
        if (existing) return { ok: true, existing: true, id: existing.id, message: "Bu kod ve ad için stok kartı zaten mevcut." };
        const insert = db.prepare(`INSERT INTO stok_kartlari (malzeme_kodu, malzeme_adi, kategori, birim, kritik_stok, raf_adresi, aciklama, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`).run(
          identity.malzeme_kodu, identity.malzeme_adi, b.kategori || "", b.birim || "Adet", num(b.kritik_stok), b.raf_adresi || "", b.aciklama || ""
        );
        return { ok: true, id: Number(insert.lastInsertRowid), message: "Stok kartı oluşturuldu." };
      }).immediate();
      return sendJSON(res, 200, result);
    } catch (e) { return sendJSON(res, e.status || 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/stok-kartlari\/\d+\/barkod$/) && method === "POST") {
  const auth = requireAuth(req, res, pathname, method);
  if (!auth) return;
  const parts = pathname.split("/");
  const id = parts;
  const b = await readBody(req);
  try {
    db.prepare(`UPDATE stok_kartlari SET barkod=? WHERE id=?`).run(b.barkod || null, id);
    return sendJSON(res, 200, { ok: true, message: "Barkod güncellendi.", barkod: b.barkod || "" });
  } catch (e) { return sendJSON(res, 500, { error: e.message }); }
}

  // 2. Müşteri Kartları
  if (pathname === "/api/musteri-kartlari" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM musteri_kartlari ORDER BY musteri_adi ASC").all());
  }
  if (pathname === "/api/musteri-kartlari" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    try {
      db.prepare(`INSERT INTO musteri_kartlari (musteri_adi, yetkili, telefon, eposta, adres, vergi_no, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`).run(
        b.musteri_adi.trim(), b.yetkili || "", b.telefon || "", b.eposta || "", b.adres || "", b.vergi_no || ""
      );
      return sendJSON(res, 200, { ok: true, message: "Müşteri kartı oluşturuldu." });
    } catch (e) { return sendJSON(res, 500, { error: "Müşteri zaten kayıtlı olabilir." }); }
  }
  if (pathname.match(/^\/api\/musteri-kartlari\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    try {
      db.prepare("DELETE FROM musteri_kartlari WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Müşteri kartı silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // 3. Cari İşlemler
  if (pathname === "/api/cari-ozet" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const rows = db.prepare(`
      SELECT tedarikci_adi, 
             SUM(CASE WHEN UPPER(islem_tipi) = 'BORC' OR islem_tipi LIKE '%ALIM%' OR islem_tipi LIKE '%FATURA%' THEN COALESCE(tl_karsiligi, tutar) ELSE 0 END) as toplam_borc,
             SUM(CASE WHEN UPPER(islem_tipi) = 'ODEME' THEN COALESCE(tl_karsiligi, tutar) ELSE 0 END) as toplam_odeme_tl
      FROM cari_islemler 
      GROUP BY tedarikci_adi
      ORDER BY tedarikci_adi ASC
    `).all();
    return sendJSON(res, 200, rows);
  }
  if (pathname === "/api/cari-islemler" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const queryParams = new URLSearchParams(parsedUrl.search);
    const tedarikci = queryParams.get("tedarikci");
    let rows;
    if (tedarikci) {
      rows = db.prepare("SELECT * FROM cari_islemler WHERE tedarikci_adi = ? ORDER BY id DESC").all(tedarikci);
    } else {
      rows = db.prepare("SELECT * FROM cari_islemler ORDER BY id DESC LIMIT 200").all();
    }
    return sendJSON(res, 200, rows);
  }
  if (pathname === "/api/cari-odeme" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    try {
      const tutar = num(b.tutar);
      const paraBirimi = b.para_birimi || 'TL';
      const kur = paraBirimi === 'TL' ? 1 : (num(b.kur) > 0 ? num(b.kur) : 1);
      const tlKarsiligi = b.tl_karsiligi ? num(b.tl_karsiligi) : (tutar * kur);

      db.prepare(`
        INSERT INTO cari_islemler 
        (tedarikci_adi, islem_tipi, tutar, para_birimi, kur, tl_karsiligi, islem_tarihi, aciklama, belge_no, islemi_yapan, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        b.tedarikci_adi, b.islem_tipi || 'ODEME', tutar, paraBirimi, kur, tlKarsiligi, 
        b.islem_tarihi || new Date().toISOString().split('T')[0], b.aciklama || "", b.belge_no || "", auth.username
      );
      return sendJSON(res, 200, { ok: true, message: "Cari işlem kaydedildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/cari-islemler\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM cari_islemler WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Cari hareket silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // 4. Tekne Üretim Atölyesi
  if (pathname === "/api/tekne-uretim" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM tekne_uretim_asamalari ORDER BY id DESC").all());
  }
  if (pathname === "/api/tekne-uretim" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    try {
      db.prepare(`INSERT INTO tekne_uretim_asamalari (tekne_no, asama_adi, durum, ilerleme_yuzdesi, notlar, model, updated_at) VALUES (?, ?, 'Bekliyor', 0, ?, ?, datetime('now', 'localtime'))`).run(
        b.tekne_no, b.asama || b.asama_adi || 'Gövde Yapımı', b.notlar || '', b.model || ''
      );
      return sendJSON(res, 200, { ok: true, message: "Tekne eklendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/tekne-uretim\/\d+\/asama$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    const b = await readBody(req);
    try {
      db.prepare("UPDATE tekne_uretim_asamalari SET asama_adi = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(b.asama || b.asama_adi, id);
      return sendJSON(res, 200, { ok: true, message: "Aşama güncellendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/tekne-uretim\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    try {
      db.prepare("DELETE FROM tekne_uretim_asamalari WHERE id = ?").run(id);
      return sendJSON(res, 200, { ok: true, message: "Kayıt silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // --- ENVANTER & STOK GİRİŞ / ÇIKIŞ ---
  if (pathname === "/api/envanter" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM envanter ORDER BY malzeme_adi ASC, skt ASC, lot_no ASC").all());
  }
  if (pathname.match(/^\/api\/envanter\/\d+\/guncelle$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    const b = await readBody(req);
    try {
      db.transaction(() => {
      if (!db.prepare("SELECT id FROM envanter WHERE id = ?").get(id)) {
        const error = new Error("Envanter kaydı bulunamadı."); error.status = 404; throw error;
      }
      const identity = kimlikDogrula(b.malzeme_kodu, b.malzeme_adi);
      db.prepare("UPDATE envanter SET malzeme_kodu=?, malzeme_adi=?, raf_adresi=?, miktar=?, birim=?, kategori=?, lot_no=?, skt=? WHERE id=?").run(
        identity.malzeme_kodu, identity.malzeme_adi, b.raf_adresi || "", num(b.miktar), b.birim || "Adet", b.kategori || "", b.lot_no || "", b.skt || "", id
      );
      }).immediate();
      return sendJSON(res, 200, { ok: true, message: "Malzeme güncellendi." });
    } catch (e) { return sendJSON(res, e.status || 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/envanter\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM envanter WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Malzeme silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/envanter/sifirla" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    const b = await readBody(req);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(auth.uid);
    if (!user || !verifyPassword(b.password, user.salt, user.password_hash)) {
      return sendJSON(res, 401, { error: "Hatalı şifre!" });
    }
    try {
      db.prepare("DELETE FROM envanter").run();
      return sendJSON(res, 200, { ok: true, message: "Envanter sıfırlandı." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname === "/api/stok-giris" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const miktar = num(b.miktar);
    let stokKarti;
    try { stokKarti = stokKartiSec(b.malzeme_kodu, b.malzeme_adi); }
    catch (e) { return sendJSON(res, e.status || 500, { error: e.message }); }
    const ad = stokKarti.malzeme_adi;
    const kod = stokKarti.malzeme_kodu || ""; 
    const raf = b.raf_adresi ? b.raf_adresi.trim() : (stokKarti.raf_adresi || "Genel Depo");
    const birim = b.birim || stokKarti.birim || "Adet";
    const kategori = b.kategori || stokKarti.kategori || "";
    const lot_no = b.lot_no ? b.lot_no.trim() : "";
    const skt = b.skt ? b.skt.trim() : "";
    const uretim_tarihi = b.uretim_tarihi ? b.uretim_tarihi.trim() : "";
    
    if ((kategori.toUpperCase().includes("KİMYASAL") || ad.toUpperCase().includes("REÇİNE") || ad.toUpperCase().includes("GELCOAT") || ad.toUpperCase().includes("HARDENER")) && (!lot_no || !skt || !uretim_tarihi)) {
      return sendJSON(res, 400, { error: "Kimyasal ürünler için Lot No, Üretim Tarihi (ÜT) ve Son Kullanma Tarihi (SKT) zorunludur!" });
    }

    try {
      db.transaction(() => {
      kimlikDogrula(kod, ad);
      const existing = db.prepare(`SELECT * FROM envanter
        WHERE malzeme_kodu = ? AND malzeme_adi = ? AND raf_adresi = ?
        AND COALESCE(lot_no,'') = ? AND COALESCE(skt,'') = ? AND COALESCE(uretim_tarihi,'') = ?
      `).get(kod, ad, raf, lot_no, skt, uretim_tarihi);

      if (existing) {
        db.prepare("UPDATE envanter SET miktar = miktar + ? WHERE id = ?").run(miktar, existing.id);
      } else {
        db.prepare("INSERT INTO envanter (malzeme_kodu, malzeme_adi, raf_adresi, miktar, birim, kategori, lot_no, skt, uretim_tarihi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(kod, ad, raf, miktar, birim, kategori, lot_no, skt, uretim_tarihi);
      }
      
      db.prepare(`INSERT INTO fatura_gecmisi (malzeme_kodu, malzeme_tanim, miktar, fatura_no, fatura_tarihi, birim_fiyati, para_birimi, tedarikci, islemi_yapan, created_at, kategori, lot_no, skt, uretim_tarihi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, ?, ?, ?)`).run(
        kod, ad, miktar, b.fatura_no || "", b.fatura_tarihi || "", num(b.birim_fiyati), b.para_birimi || "", b.tedarikci || "", auth.username, kategori, lot_no, skt, uretim_tarihi
      );

      if (b.tedarikci && b.tedarikci.trim() !== "" && num(b.birim_fiyati) > 0) {
        const toplamTutar = num(b.birim_fiyati) * miktar;
        db.prepare(`INSERT INTO cari_islemler (tedarikci_adi, islem_tipi, tutar, para_birimi, tl_karsiligi, islem_tarihi, aciklama, belge_no, islemi_yapan, created_at) VALUES (?, 'BORC', ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`).run(
          b.tedarikci.trim(), toplamTutar, b.para_birimi || 'TL', toplamTutar, b.fatura_tarihi || new Date().toISOString().split('T')[0], 'Stok Girişi (Otomatik)', b.fatura_no || "", auth.username
        );
      }
      }).immediate();
      return sendJSON(res, 200, { ok: true, message: "Stok girişi başarıyla kaydedildi." });
    } catch (e) { return sendJSON(res, e.status || 500, { error: e.message }); }
  }

  if (pathname === "/api/stok-cikis" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const miktar = num(b.miktar);
    const envanterItem = db.prepare("SELECT * FROM envanter WHERE id = ?").get(b.envanter_id);
    if (!envanterItem) return sendJSON(res, 400, { error: "Seçilen envanter kalemi veya lot bulunamadı." });
    if (envanterItem.miktar < miktar) return sendJSON(res, 400, { error: `Yetersiz stok! (Seçilen Lot Kalan Miktar: ${envanterItem.miktar})` });
    
    try {
      db.prepare("UPDATE envanter SET miktar = miktar - ? WHERE id = ?").run(miktar, envanterItem.id);
      db.prepare(`INSERT INTO cikislar (malzeme_tanim, miktar, tekne_no, teslim_edilen, raf_adresi, lot_no, skt, uretim_tarihi, islemi_yapan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`).run(
        envanterItem.malzeme_adi, miktar, b.tekne_no || "", b.teslim_edilen || "", envanterItem.raf_adresi, envanterItem.lot_no || "", envanterItem.skt || "", envanterItem.uretim_tarihi || "", auth.username
      );
      return sendJSON(res, 200, { ok: true, message: "Stok çıkışı kaydedildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname === "/api/cikislar" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM cikislar ORDER BY id DESC").all());
  }

  if (pathname.match(/^\/api\/cikislar\/\d+\/iptal$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    const cikis = db.prepare("SELECT * FROM cikislar WHERE id = ? AND iptal = 0").get(id);
    if (!cikis) return sendJSON(res, 404, { error: "Kayıt bulunamadı." });
    try {
      db.prepare("UPDATE cikislar SET iptal = 1 WHERE id = ?").run(id);
      let item = (cikis.lot_no || cikis.skt) ? 
        db.prepare("SELECT * FROM envanter WHERE malzeme_adi = ? AND raf_adresi = ? AND COALESCE(lot_no,'') = ? AND COALESCE(skt,'') = ?").get(cikis.malzeme_tanim, cikis.raf_adresi, cikis.lot_no || "", cikis.skt || "") :
        db.prepare("SELECT * FROM envanter WHERE malzeme_adi = ? AND raf_adresi = ? AND (lot_no IS NULL OR lot_no = '')").get(cikis.malzeme_tanim, cikis.raf_adresi);

      if (item) {
        db.prepare("UPDATE envanter SET miktar = miktar + ? WHERE id = ?").run(cikis.miktar, item.id);
      } else {
        db.prepare("INSERT INTO envanter (malzeme_adi, raf_adresi, miktar, birim, lot_no, skt) VALUES (?, ?, ?, 'Adet', ?, ?)").run(cikis.malzeme_tanim, cikis.raf_adresi, cikis.miktar, cikis.lot_no || "", cikis.skt || "");
      }
      return sendJSON(res, 200, { ok: true, message: "Çıkış iptal edildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // --- DEMİRBAŞ / ZİMMET ---
  if (pathname === "/api/demirbas" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM el_aletleri ORDER BY id DESC").all());
  }
  if (pathname === "/api/demirbas/yeni-no" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const last = db.prepare("SELECT demirbas_no FROM el_aletleri ORDER BY id DESC LIMIT 1").get();
    let nextNo = "DMRBS-001";
    if (last && last.demirbas_no) {
      const numPart = parseInt(last.demirbas_no.replace("DMRBS-", "")) || 0;
      nextNo = `DMRBS-${String(numPart + 1).padStart(3, "0")}`;
    }
    return sendJSON(res, 200, { demirbas_no: nextNo });
  }
  if (pathname === "/api/demirbas/yeni" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    let demirbas_no = b.demirbas_no;
    if (!demirbas_no) {
      const last = db.prepare("SELECT demirbas_no FROM el_aletleri ORDER BY id DESC LIMIT 1").get();
      let numPart = 1;
      if (last && last.demirbas_no) numPart = (parseInt(last.demirbas_no.replace("DMRBS-", "")) || 0) + 1;
      demirbas_no = `DMRBS-${String(numPart).padStart(3, "0")}`;
    }
    try {
      db.prepare(`INSERT INTO el_aletleri (demirbas_no, marka, model, miktar, seri_no, alis_tarihi, alis_fiyati, kondisyon, durum, aciklama) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STOKTA', ?)`).run(
        demirbas_no, b.marka || "", b.model || "", num(b.miktar) || 1, b.seri_no || "", b.alis_tarihi || "", num(b.alis_fiyati), b.kondisyon || "Yeni", b.aciklama || ""
      );
      return sendJSON(res, 200, { ok: true, demirbas_no, message: "Demirbaş kaydedildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/demirbas\/\d+\/guncelle$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[3];
    const b = await readBody(req);
    try {
      db.prepare("UPDATE el_aletleri SET marka=?, model=?, miktar=?, seri_no=?, alis_tarihi=?, alis_fiyati=?, kondisyon=?, aciklama=? WHERE id=?").run(
        b.marka || null, b.model || null, num(b.miktar) || 1, b.seri_no || null, b.alis_tarihi || null, b.alis_fiyati ? num(b.alis_fiyati) : null, b.kondisyon || null, b.aciklama || null, id
      );
      return sendJSON(res, 200, { ok: true, message: "Demirbaş güncellendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/demirbas\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM el_aletleri WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Demirbaş silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/demirbas/ver" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const item = db.prepare("SELECT * FROM el_aletleri WHERE demirbas_no = ?").get(b.demirbas_no);
    if (!item) return sendJSON(res, 404, { error: "Demirbaş bulunamadı." });
    try {
      db.prepare("UPDATE el_aletleri SET durum = 'ZİMMETLİ', kondisyon = ? WHERE id = ?").run(b.kondisyon || item.kondisyon, item.id);
      db.prepare(`INSERT INTO zimmet_gecmisi (demirbas_no, marka, model, seri_no, zimmetlenen_kisi, teslim_tarihi, kondisyon, aciklama, islemi_yapan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        item.demirbas_no, item.marka, item.model, item.seri_no, b.zimmetlenen_kisi, b.teslim_tarihi || new Date().toISOString().split("T")[0], b.kondisyon || item.kondisyon, b.aciklama || "", auth.username
      );
      return sendJSON(res, 200, { ok: true, message: "Demirbaş zimmetlendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/demirbas/iade" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const item = db.prepare("SELECT * FROM el_aletleri WHERE demirbas_no = ?").get(b.demirbas_no);
    if (!item) return sendJSON(res, 404, { error: "Demirbaş bulunamadı." });
    try {
      db.prepare("UPDATE el_aletleri SET durum = 'STOKTA', kondisyon = ? WHERE id = ?").run(b.kondisyon || item.kondisyon, item.id);
      db.prepare(`INSERT INTO zimmet_gecmisi (demirbas_no, marka, model, seri_no, iade_eden, iade_tarihi, kondisyon, aciklama, islemi_yapan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        item.demirbas_no, item.marka, item.model, item.seri_no, b.iade_eden, b.iade_tarihi || new Date().toISOString().split("T")[0], b.kondisyon || item.kondisyon, b.aciklama || "", auth.username
      );
      return sendJSON(res, 200, { ok: true, message: "Demirbaş iade alındı." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/demirbas/hurda" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const item = db.prepare("SELECT * FROM el_aletleri WHERE demirbas_no = ?").get(b.demirbas_no);
    if (!item) return sendJSON(res, 404, { error: "Demirbaş bulunamadı." });
    try {
      db.prepare("UPDATE el_aletleri SET durum = 'HURDA', kondisyon = 'Hurda' WHERE id = ?").run(item.id);
      db.prepare(`INSERT INTO zimmet_gecmisi (demirbas_no, marka, model, seri_no, hurda_tarihi, kondisyon, aciklama, islemi_yapan) VALUES (?, ?, ?, ?, ?, 'Hurda', ?, ?)`).run(
        item.demirbas_no, item.marka, item.model, item.seri_no, b.hurda_tarihi || new Date().toISOString().split("T")[0], b.aciklama || "", auth.username
      );
      return sendJSON(res, 200, { ok: true, message: "Demirbaş hurdaya ayrıldı." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/zimmet" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM zimmet_gecmisi ORDER BY id DESC").all());
  }
  if (pathname.match(/^\/api\/zimmet\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM zimmet_gecmisi WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Kayıt silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // --- AYARLAR & KULLANICILAR & FATURALAR & RAPORLAR ---
  if (pathname === "/api/ayarlar" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const tip = parsedUrl.searchParams.get("tip");
    if (tip) return sendJSON(res, 200, db.prepare("SELECT * FROM ayarlar WHERE tip = ? ORDER BY deger ASC").all(tip));
    return sendJSON(res, 200, db.prepare("SELECT * FROM ayarlar ORDER BY tip, deger ASC").all());
  }
  if (pathname === "/api/ayarlar" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    if (!b.tip || !b.deger) return sendJSON(res, 400, { error: "Tip ve değer zorunludur." });
    try {
      const exists = db.prepare("SELECT * FROM ayarlar WHERE tip = ? AND deger = ?").get(b.tip, b.deger.trim());
      if (!exists) db.prepare("INSERT INTO ayarlar (tip, deger) VALUES (?, ?)").run(b.tip, b.deger.trim());
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/ayarlar\/\d+$/) && method === "DELETE") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    try {
      db.prepare("DELETE FROM ayarlar WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname === "/api/users" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    return sendJSON(res, 200, db.prepare("SELECT id, username, role FROM users").all());
  }
  if (pathname === "/api/users" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    const b = await readBody(req);
    if (!b.username || !b.password) return sendJSON(res, 400, { error: "Kullanıcı adı ve şifre zorunludur." });
    try {
      const { password_hash, salt } = hashPassword(b.password);
      db.prepare("INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)").run(b.username.trim(), password_hash, salt, b.role || "personel");
      return sendJSON(res, 200, { ok: true, message: "Kullanıcı eklendi." });
    } catch (e) { return sendJSON(res, 500, { error: "Bu kullanıcı adı zaten alınmış." }); }
  }
  if (pathname.match(/^\/api\/users\/\d+$/) && method === "DELETE") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Kullanıcı silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/users\/\d+\/yetki$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    const b = await readBody(req);
    try {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(b.role, pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Yetki güncellendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname === "/api/fatura" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM fatura_gecmisi ORDER BY id DESC").all());
  }
if (pathname.match(/^\/api\/fatura\/\d+\/guncelle$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const parts = pathname.split("/");
    const id = parts[3];
    const b = await readBody(req);
    try {
      const identity = kimlikDogrula(b.malzeme_kodu, b.malzeme_tanim);
      db.prepare(`UPDATE fatura_gecmisi SET malzeme_kodu=?, malzeme_tanim=?, miktar=?, fatura_no=?, fatura_tarihi=?, birim_fiyati=?, para_birimi=?, tedarikci=?, kategori=?, lot_no=?, skt=?, uretim_tarihi=? WHERE id=?`).run(
        identity.malzeme_kodu, 
        identity.malzeme_adi, 
        num(b.miktar), 
        b.fatura_no || "", 
        b.fatura_tarihi || "", 
        b.birim_fiyati ? num(b.birim_fiyati) : null, 
        b.para_birimi || "", 
        b.tedarikci || "", 
        b.kategori || "", 
        b.lot_no || "", 
        b.skt || "", 
        b.uretim_tarihi || "", 
        id
      );
      return sendJSON(res, 200, { ok: true, message: "Fatura güncellendi." });
    } catch (e) { return sendJSON(res, e.status || 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/fatura\/\d+\/iptal$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    const id = pathname.split("/")[3];
    const fatura = db.prepare("SELECT * FROM fatura_gecmisi WHERE id = ? AND iptal = 0").get(id);
    if (!fatura) return sendJSON(res, 404, { error: "Kayıt bulunamadı." });
    try {
      db.prepare("UPDATE fatura_gecmisi SET iptal = 1 WHERE id = ?").run(id);
      let item = (fatura.lot_no || fatura.skt) ? 
        db.prepare("SELECT * FROM envanter WHERE malzeme_adi = ? AND COALESCE(lot_no,'') = ? AND COALESCE(skt,'') = ?").get(fatura.malzeme_tanim, fatura.lot_no || "", fatura.skt || "") :
        db.prepare("SELECT * FROM envanter WHERE malzeme_adi = ? AND (lot_no IS NULL OR lot_no = '')").get(fatura.malzeme_tanim);
      if (item) {
        db.prepare("UPDATE envanter SET miktar = MAX(0, miktar - ?) WHERE id = ?").run(fatura.miktar, item.id);
      }
      return sendJSON(res, 200, { ok: true, message: "Fatura iptal edildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/fatura\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    if (auth.role !== "yonetici") return sendJSON(res, 403, { error: "Yetkisiz işlem." });
    try {
      db.prepare("DELETE FROM fatura_gecmisi WHERE id = ?").run(pathname.split("/")[3]);
      return sendJSON(res, 200, { ok: true, message: "Fatura silindi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // --- SATIN ALMA TALEPLERİ ---
  if (pathname === "/api/satinalma/talep-olustur" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const seciliUrunler = b.seciliUrunler || [];
    const grupAdi = (b.grup_adi || "Genel Satın Alma Talebi").trim();
    const terminTarihi = b.termin_tarihi || b.terminTarihi || null; 

    if (!seciliUrunler.length) return sendJSON(res, 400, { error: "Seçili ürün bulunamadı." });
    try {
      const stmt = db.prepare(`INSERT INTO satinalma_talepleri (malzeme_kodu, malzeme_adi, talep_miktari, birim, talep_eden, termin_tarihi, durum, grup_adi, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Bekliyor', ?, datetime('now', 'localtime'))`);
      db.transaction((items) => {
        for (let s of items) {
          const item = db.prepare("SELECT * FROM envanter WHERE id = ?").get(s.id) || {};
          stmt.run(
            item.malzeme_kodu || s.malzeme_kodu || "YENİ", 
            item.malzeme_adi || s.malzeme_adi, 
            s.siparisMiktari, 
            item.birim || s.birim || "Adet", 
            auth.username, 
            terminTarihi, 
            grupAdi
          );
        }
      })(seciliUrunler);
      return sendJSON(res, 200, { ok: true, message: `Talep başarıyla oluşturuldu!` });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  
  if (pathname === "/api/satinalma/talepler" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    return sendJSON(res, 200, db.prepare("SELECT * FROM satinalma_talepleri ORDER BY id DESC").all());
  }

  if (pathname.match(/^\/api\/satinalma\/talepler\/\d+\/reddet$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[4];
    const b = await readBody(req);
    const redSebebi = b.red_sebebi || "Belirtilmedi";
    try {
      db.prepare("UPDATE satinalma_talepleri SET durum = 'Reddedildi', red_sebebi = ? WHERE id = ?").run(redSebebi, id);
      return sendJSON(res, 200, { ok: true, message: "Talep reddedildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname.match(/^\/api\/satinalma\/talepler\/\d+\/onayla$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    try {
      const id = pathname.split("/")[4];
      const talep = db.prepare("SELECT durum FROM satinalma_talepleri WHERE id = ?").get(id);
      if (!talep) return sendJSON(res, 404, { error: "Talep bulunamadı." });
      
      let yeniDurum = "Onaylandı";
      if (talep.durum === "Bekliyor") {
        yeniDurum = "Satın Alma Onayladı";
      } else if (talep.durum.toLowerCase().includes("satın alma onayladı") || talep.durum.toLowerCase().includes("satin alma onayladi")) {
        if (auth.role !== "yonetici") {
          return sendJSON(res, 403, { error: "Bu işlem için Yönetici yetkisi gereklidir." });
        }
        yeniDurum = "Onaylandı";
      }
      db.prepare("UPDATE satinalma_talepleri SET durum = ? WHERE id = ?").run(yeniDurum, id);
      return sendJSON(res, 200, { ok: true, message: "Onay başarıyla kaydedildi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname.match(/^\/api\/satinalma\/talepler\/\d+\/guncelle$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const id = pathname.split("/")[4];
    const b = await readBody(req);
    const yeniMiktar = num(b.talep_miktari);
    const terminTarihi = b.termin_tarihi || null;
    try {
      const talep = db.prepare("SELECT * FROM satinalma_talepleri WHERE id = ?").get(id);
      if (!talep) return sendJSON(res, 404, { error: "Talep bulunamadı." });
      
      db.prepare("UPDATE satinalma_talepleri SET talep_miktari = ?, termin_tarihi = COALESCE(?, termin_tarihi) WHERE id = ?").run(yeniMiktar, terminTarihi, id);
      return sendJSON(res, 200, { ok: true, message: "Talep güncellendi." });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname.match(/^\/api\/satinalma\/talepler\/\d+\/sil$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    try {
      db.prepare("DELETE FROM satinalma_talepleri WHERE id = ?").run(pathname.split("/")[4]);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname === "/api/satinalma/grup-sil" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    const grupAdi = b.grup_adi;
    if (!grupAdi) return sendJSON(res, 400, { error: "Grup adı belirtilmedi." });
    try {
      db.prepare("DELETE FROM satinalma_talepleri WHERE grup_adi = ?").run(grupAdi);
      return sendJSON(res, 200, { ok: true, message: `"${grupAdi}" grubuna ait tüm talepler silindi.` });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  if (pathname.match(/^\/api\/satinalma\/teklifler\/\d+$/) && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const talepId = pathname.split("/")[4];
    try {
      const talep = db.prepare("SELECT malzeme_adi FROM satinalma_talepleri WHERE id = ?").get(talepId);
      if (!talep) return sendJSON(res, 200, []);
      const benzerTalepler = db.prepare("SELECT id FROM satinalma_talepleri WHERE TRIM(malzeme_adi) = TRIM(?)").all(talep.malzeme_adi);
      const talepIds = benzerTalepler.map(t => t.id);
      if (talepIds.length === 0) return sendJSON(res, 200, []);
      const placeholders = talepIds.map(() => '?').join(',');
      const teklifler = db.prepare(`SELECT * FROM tedarikci_teklifleri WHERE talep_id IN (${placeholders}) ORDER BY birim_fiyat ASC`).all(...talepIds);
      return sendJSON(res, 200, teklifler);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname === "/api/satinalma/teklif-ekle" && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const b = await readBody(req);
    try {
      db.prepare(`INSERT INTO tedarikci_teklifleri (talep_id, tedarikci_adi, birim_fiyat, para_birimi, notlar, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`).run(b.talep_id, b.tedarikci_adi.trim(), num(b.birim_fiyat), b.para_birimi || "TL", b.aciklama || "");
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/satinalma\/teklifler\/sil\/\d+$/) && method === "POST") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    try {
      db.prepare("DELETE FROM tedarikci_teklifleri WHERE id = ?").run(pathname.split("/")[5]);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (pathname.match(/^\/api\/satinalma\/gecmis-fiyatlar\/(.+)$/) && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const malzemeAdi = decodeURIComponent(pathname.split("/")[4]).trim();
    try {
      const rows = db.prepare(`SELECT fatura_tarihi, birim_fiyati, para_birimi, tedarikci, fatura_no FROM fatura_gecmisi WHERE TRIM(malzeme_tanim) LIKE ? AND iptal = 0 AND birim_fiyati IS NOT NULL AND birim_fiyati > 0 ORDER BY fatura_tarihi DESC, id DESC LIMIT 5`).all(`%${malzemeAdi}%`);
      return sendJSON(res, 200, rows);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // --- ÖZET VE RAPORLAR ---
  if (pathname === "/api/rapor/ozet" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const toplamKalem = db.prepare("SELECT COUNT(*) as c FROM envanter").get().c;
    const toplamMiktar = db.prepare("SELECT SUM(miktar) as s FROM envanter").get().s || 0;
    const zimmetliSayisi = db.prepare("SELECT COUNT(*) as c FROM el_aletleri WHERE durum = 'ZİMMETLİ'").get().c;
    const hurdaSayisi = db.prepare("SELECT COUNT(*) as c FROM el_aletleri WHERE durum = 'HURDA'").get().c;
    const sonCikislar = db.prepare("SELECT * FROM cikislar ORDER BY id DESC LIMIT 5").all();
    const sonGirisler = db.prepare("SELECT * FROM fatura_gecmisi ORDER BY id DESC LIMIT 5").all();
    return sendJSON(res, 200, { toplamKalem, toplamMiktar, zimmetliSayisi, hurdaSayisi, sonCikislar, sonGirisler });
  }

  if (pathname === "/api/rapor/detayli" && method === "GET") {
    const auth = requireAuth(req, res, pathname, method);
    if (!auth) return;
    const kritikStoklar = db.prepare("SELECT * FROM envanter WHERE miktar <= 5 ORDER BY miktar ASC").all();
    const tekneCikislar = db.prepare("SELECT tekne_no, teslim_edilen, malzeme_tanim, SUM(miktar) as toplam_miktar, raf_adresi FROM cikislar WHERE iptal = 0 GROUP BY tekne_no, teslim_edilen, malzeme_tanim").all();
    const tumCikislar = db.prepare("SELECT * FROM cikislar WHERE iptal = 0 ORDER BY id DESC").all();
    const personelListesi = db.prepare("SELECT DISTINCT deger FROM ayarlar WHERE tip = 'personel' ORDER BY deger ASC").all();
    const aktifZimmetler = db.prepare("SELECT * FROM el_aletleri WHERE durum = 'ZİMMETLİ'").all().map(d => {
      const z = db.prepare("SELECT * FROM zimmet_gecmisi WHERE demirbas_no = ? AND iade_tarihi IS NULL ORDER BY id DESC LIMIT 1").get(d.demirbas_no);
      return { ...d, personel: z ? z.zimmetlenen_kisi : "Bilinmiyor", teslim_tarihi: z ? z.teslim_tarihi : "" };
    });
    return sendJSON(res, 200, { kritikStoklar, tekneCikislar, tumCikislar, personelListesi, aktifZimmetler });
  }

  res.writeHead(404);
  res.end("API bulunamadı");
}

function onRequest(req, res) {
  handleRequest(req, res).catch((err) => {
    console.error("İstek hatası:", req.method, req.url, err);
    try {
      if (!res.headersSent) sendJSON(res, 500, { error: "Sunucu hatası: " + err.message });
      else res.end();
    } catch (_) {}
  });
}

const server = options ? https.createServer(options, onRequest) : http.createServer(onRequest);
const PORT = process.env.PORT || 3002;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DepoKontrol sunucusu http://localhost:${PORT} adresinde calisiyor.`);
});

// DEPO_BARKOD_V2_SERVER_BEGIN
;(() => {
  "use strict";

  if (
    !db.prepare("PRAGMA table_info(stok_kartlari)")
      .all()
      .some(c => c.name === "barkod")
  ) {
    db.exec("ALTER TABLE stok_kartlari ADD COLUMN barkod TEXT");
  }

  const eskiHandleRequest = handleRequest;

  const yazabilen = ["yonetici", "depopersoneli"];
  const okuyabilen = [...yazabilen, "satinalma"];
  const temiz = v => String(v ?? "").trim();

  function hata(status, message) {
    const e = new Error(message);
    e.status = status;
    throw e;
  }

  function barkodKontrol(v, bosOlabilir = false) {
    if (typeof v !== "string") {
      hata(400, "Barkod metin olarak gönderilmelidir.");
    }

    const kod = v.trim();

    if (
      (!kod && !bosOlabilir) ||
      kod.length > 256 ||
      /[\x00-\x1f\x7f]/.test(kod)
    ) {
      hata(
        400,
        "Barkod 1–256 karakter olmalı ve kontrol karakteri içermemelidir."
      );
    }

    return kod;
  }

  function kartBul(kod) {
    const kartlar = db.prepare(`
      SELECT *
      FROM stok_kartlari
      WHERE TRIM(COALESCE(barkod, '')) = ?
         OR TRIM(COALESCE(malzeme_kodu, '')) = ?
    `).all(kod, kod);

    if (!kartlar.length) {
      hata(
        404,
        "Bu barkod tanımlı değil. Stok Kartları > Barkod Tanımla bölümünden ürüne bağlayın."
      );
    }

    if (kartlar.length !== 1) {
      hata(
        409,
        "Bu kod birden fazla stok kartıyla eşleşiyor. Barkod ve malzeme kodlarını kontrol edin."
      );
    }

    const kart = kartlar[0];

    // Mevcut stok akışı ürün adı kullanıyor.
    // Aynı isimli farklı kartlarda yanlış ürün seçilmesini önle.
    const ayniAd = db.prepare(`
      SELECT id
      FROM stok_kartlari
      WHERE TRIM(malzeme_adi) = ?
    `).all(temiz(kart.malzeme_adi));

    if (!temiz(kart.malzeme_adi) || ayniAd.length !== 1) {
      hata(
        409,
        "Bu malzeme adı birden fazla kartta kullanılıyor veya boş. Önce stok kartlarını düzeltin."
      );
    }

    return kart;
  }

  const kaydet = db.transaction((id, kod, onceki) => {
    const kart = db.prepare(
      "SELECT * FROM stok_kartlari WHERE id = ?"
    ).get(id);

    if (!kart) {
      hata(404, "Stok kartı bulunamadı.");
    }

    if (temiz(kart.barkod) !== onceki) {
      hata(
        409,
        "Barkod başka bir işlemde değişti. Listeyi yenileyip tekrar deneyin."
      );
    }

    if (kod) {
      const cakisan = db.prepare(`
        SELECT id
        FROM stok_kartlari
        WHERE id <> ?
          AND (
            TRIM(COALESCE(barkod, '')) = ?
            OR TRIM(COALESCE(malzeme_kodu, '')) = ?
          )
      `).get(id, kod, kod);

      if (cakisan) {
        hata(
          409,
          "Bu barkod başka bir ürünün barkodu veya malzeme kodu olarak kullanılıyor."
        );
      }
    }

    db.prepare(`
      UPDATE stok_kartlari
      SET barkod = ?
      WHERE id = ?
    `).run(kod || null, id);

    return {
      id: kart.id,
      barkod: kod
    };
  });

  handleRequest = async function(req, res) {
    const url = new URL(req.url, "http://localhost");

    const eslesme = url.pathname.match(
      /^\/api\/stok-kartlari\/(\d+)\/barkod$/
    );

    const arama =
      url.pathname === "/api/stok-kartlari/barkod-bul";

    if (!eslesme && !arama) {
      return eskiHandleRequest(req, res);
    }

    const auth = requireAuth(
      req,
      res,
      url.pathname,
      req.method
    );

    if (!auth) return;

    if (!(arama ? okuyabilen : yazabilen).includes(auth.role)) {
      return sendJSON(res, 403, {
        error: "Bu barkod işlemi için yetkiniz yok."
      });
    }

    if (req.method !== (arama ? "GET" : "POST")) {
      return sendJSON(res, 405, {
        error: "Geçersiz istek yöntemi."
      });
    }

    try {
      if (arama) {
        const kod = barkodKontrol(
          url.searchParams.get("kod")
        );

        const kart = kartBul(kod);

        const kaynak =
          url.searchParams.get("kaynak") || "stokkart";

        if (!["stokkart", "envanter"].includes(kaynak)) {
          hata(400, "Geçersiz barkod arama kaynağı.");
        }

        let envanterIds = [];

        if (kaynak === "envanter") {
          const kodlu = temiz(kart.malzeme_kodu);

          const rows = db.prepare(`
            SELECT id, malzeme_kodu
            FROM envanter
            WHERE malzeme_adi = ?
              AND miktar > 0
          `).all(kart.malzeme_adi);

          if (
            rows.some(r => temiz(r.malzeme_kodu) !== kodlu)
          ) {
            hata(
              409,
              "Aynı ürün adında farklı malzeme kodları var. Envanter kayıtlarını kontrol edin."
            );
          }

          envanterIds = rows.map(r => r.id);

          if (!envanterIds.length) {
            hata(
              404,
              "Ürün bulundu ancak çıkış yapılabilecek stoku yok."
            );
          }
        }

        return sendJSON(res, 200, {
          kart,
          envanter_ids: envanterIds
        });
      }

      const id = Number(eslesme[1]);

      if (!Number.isSafeInteger(id) || id < 1) {
        hata(400, "Geçersiz stok kartı.");
      }

      const b = await readBody(req);
      const kod = barkodKontrol(b?.barkod, true);

      if (typeof b?.onceki_barkod !== "string") {
        hata(
          400,
          "Önceki barkod bilgisi eksik. Sayfayı yenileyin."
        );
      }

      const sonuc = kaydet.immediate(
        id,
        kod,
        b.onceki_barkod.trim()
      );

      return sendJSON(res, 200, {
        ok: true,
        ...sonuc,
        message: kod
          ? "Barkod ürüne tanımlandı."
          : "Barkod eşleştirmesi kaldırıldı."
      });
    } catch (e) {
      if (!e.status) {
        console.error("Barkod işlemi:", e);
      }

      return sendJSON(res, e.status || 500, {
        error: e.status
          ? e.message
          : "Barkod işlemi tamamlanamadı."
      });
    }
  };
})();
// DEPO_BARKOD_V2_SERVER_END
