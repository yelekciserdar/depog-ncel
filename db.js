// db.js — SQLite şeması ve başlangıç verileri
// Node'un yerleşik node:sqlite modülünü kullanır -> harici paket kurulumu GEREKMEZ.
const DatabaseSync = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "data", "envanter.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'personel',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS envanter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  malzeme_kodu TEXT,
  malzeme_adi TEXT NOT NULL,
  raf_adresi TEXT,
  miktar REAL NOT NULL DEFAULT 0,
  hedef_miktar REAL NOT NULL DEFAULT 0, -- Yeni eklenen alan (Aylık olması gereken miktar)
  birim TEXT,
  UNIQUE(malzeme_adi, raf_adresi)
);

CREATE TABLE IF NOT EXISTS fatura (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  malzeme_kodu TEXT,
  malzeme_tanim TEXT NOT NULL,
  raf_adresi TEXT,
  miktar REAL,
  birim TEXT,
  fatura_no TEXT,
  fatura_tarihi TEXT,
  birim_fiyati REAL,
  para_birimi TEXT,
  tedarikci TEXT,
  iptal INTEGER DEFAULT 0,
  islemi_yapan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cikislar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  malzeme_kodu TEXT,
  malzeme_tanim TEXT NOT NULL,
  miktar REAL,
  birim TEXT,
  raf_adresi TEXT,
  tekne_no TEXT,
  teslim_edilen TEXT,
  islem_tarihi TEXT DEFAULT (datetime('now')),
  iptal INTEGER DEFAULT 0,
  islemi_yapan TEXT
);

CREATE TABLE IF NOT EXISTS el_aletleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demirbas_no TEXT UNIQUE NOT NULL,
  marka TEXT,
  model TEXT,
  miktar REAL DEFAULT 1,
  seri_no TEXT,
  alis_tarihi TEXT,
  alis_fiyati REAL,
  kondisyon TEXT,
  durum TEXT DEFAULT 'STOKTA',
  aciklama TEXT,
  islemi_yapan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zimmet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demirbas_no TEXT,
  marka TEXT,
  model TEXT,
  miktar REAL,
  seri_no TEXT,
  zimmetlenen_kisi TEXT,
  teslim_tarihi TEXT,
  iade_tarihi TEXT,
  iade_eden TEXT,
  mevcut_durum TEXT,
  kondisyon TEXT,
  aciklama TEXT,
  hurda_tarihi TEXT,
  islemi_yapan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ayarlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tip TEXT NOT NULL,   -- marka | kategori | personel | tekne | para_birimi | birim
  deger TEXT NOT NULL,
  UNIQUE(tip, deger)
);
`);

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

// --- İlk kurulum: örnek kullanıcılar ve referans listeleri ---
function seed() {
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount === 0) {
    const defaultUsers = [
      { username: "SERDAR YELEKÇİ", password: "2525", role: "yonetici" },
      { username: "ERTAN KARA", password: "2526", role: "yonetici" },
    ];
    const insert = db.prepare(
      "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)"
    );
    for (const u of defaultUsers) {
      const { hash, salt } = hashPassword(u.password);
      insert.run(u.username, hash, salt, u.role);
    }
  }

  const ayarCount = db.prepare("SELECT COUNT(*) AS c FROM ayarlar").get().c;
  if (ayarCount === 0) {
    const insertAyar = db.prepare(
      "INSERT OR IGNORE INTO ayarlar (tip, deger) VALUES (?, ?)"
    );
    const markalar = ["MİRKA", "BOSCH"];
    const personel = [
      "AHMAD ALMAHMOD",
      "ALİ KAMİL ÇELEBİ",
      "SALİM ŞENTÜRK",
      "HÜSNÜ EROĞLU",
    ];
    const paraBirimleri = ["TL", "USD", "EUR"];
    const birimler = ["Adet", "Metre"];
    const kategoriler = ["EL ALETLERİ"];
    markalar.forEach((v) => insertAyar.run("marka", v));
    personel.forEach((v) => insertAyar.run("personel", v));
    paraBirimleri.forEach((v) => insertAyar.run("para_birimi", v));
    birimler.forEach((v) => insertAyar.run("birim", v));
    kategoriler.forEach((v) => insertAyar.run("kategori", v));
  }
}
seed();

module.exports = { db, hashPassword, verifyPassword };
