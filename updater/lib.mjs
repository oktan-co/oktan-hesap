// Saf yardımcı fonksiyonlar (ağ ve veritabanı yok) — test edilebilir olsun diye ayrı dosyada.

export const TZ = 'Europe/Istanbul';

/** İstanbul saatine göre {date:'YYYY-MM-DD', hm:'HH:MM', dow:0-6, mins} */
export function istanbulNow(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${hour}:${p.minute}`, dow, mins: (+hour) * 60 + (+p.minute) };
}

export function addDaysIso(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "6.602,18" -> 6602.18 (Türk biçimi). Okunamazsa NaN. */
export function trNum(s) {
  s = String(s ?? '').trim().replace(/\s|₺|TL/g, '');
  if (!/^-?[\d.]*,?\d+$/.test(s)) return NaN;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** "6.40425" veya "3,575,590,000" -> sayı (ABD biçimi, Bloomberg HT). */
export function usNum(s) {
  s = String(s ?? '').trim();
  if (!/^-?[\d,]*\.?\d+$/.test(s)) return NaN;
  return Number(s.replace(/,/g, ''));
}

export function decimalsOf(s) { const m = String(s).match(/[.,](\d+)$/); return m ? m[1].length : 0; }

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
/** HTML -> düz metin (etiketler boşluk olur, sıra korunur). */
export function htmlText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ');
}

/**
 * doviz.com tekil ürün sayfası: "Son (22:56) 6.617,79 %-0,57 (-37,94) Alış / Satış 6.537,01 / 6.617,79"
 * -> {alis, satis, t} ya da null
 */
export function parseDoviz(html) {
  const text = htmlText(html);
  const tm = text.match(/Son\s*\(\s*(\d{1,2}):(\d{2})\s*\)/);
  if (!tm) return null;
  const rest = text.slice(tm.index);
  let m = rest.match(/Alış\s*\/\s*Satış\s*(-?[\d.]+,\d+)\s*\/\s*(-?[\d.]+,\d+)/);
  if (!m) m = rest.match(/Alış\s*:?\s*(-?[\d.]+,\d+)[^\d]{0,60}?Satış\s*:?\s*(-?[\d.]+,\d+)/);
  if (!m) return null;
  const alis = trNum(m[1]), satis = trNum(m[2]);
  if (!(alis > 0) || !(satis > 0)) return null;
  return { alis, satis, t: `${tm[1].padStart(2, '0')}:${tm[2]}` };
}

/** Sayfa saati (HH:MM) için tarihi bul: şimdiki saatten 10 dk'dan fazla ilerideyse dünkü saattir. */
export function stampFor(hm, now = istanbulNow()) {
  const [h, m] = hm.split(':').map(Number);
  const date = (h * 60 + m) > now.mins + 10 ? addDaysIso(now.date, -1) : now.date;
  return { d: date, key: `${date} ${hm}` };
}

/** Kayıtlı ürünün zaman anahtarı. Eski kayıtlarda d yoksa belgenin updatedAt tarihini kullan. */
export function storedKey(item, docUpdatedAt) {
  if (!item || !item.t) return '';
  let d = item.d;
  if (!d && docUpdatedAt) {
    const u = istanbulNow(docUpdatedAt);
    // updatedAt t'den önceyse (gece yarısı geçişi) bir gün geri al
    d = item.t > u.hm ? addDaysIso(u.date, -1) : u.date;
  }
  return `${d || '0000-00-00'} ${item.t}`;
}

export function tooFar(oldV, newV, pct = 0.15) {
  return oldV > 0 && Math.abs(newV - oldV) / oldV > pct;
}

/* ---------- fonlar ---------- */

export const ddmmyyyy = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const dmyKey = s => { const m = String(s || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? `${m[3]}${m[2]}${m[1]}` : ''; };

/** Bloomberg HT fon sayfası: "Son Fiyat Bilgileri - 19/10/2026 ... Fiyatı 6.40425" */
export function parseBloomberg(html) {
  const text = htmlText(html);
  const dm = text.match(/Son Fiyat Bilgileri\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dm) return null;
  const pm = text.slice(dm.index).match(/Fiyatı\s*([\d,]*\.?\d+)/);
  if (!pm) return null;
  const price = usNum(pm[1]);
  if (!(price > 0)) return null;
  return { price, decimals: decimalsOf(pm[1]), date: `${dm[1]}.${dm[2]}.${dm[3]}` };
}

/** Kurucu şirketin (ör. Aktif Portföy) tarayıcıda çizilmiş fon sayfası -> {price, decimals}. Sayfada tarih yok. */
export function parseIssuerPage(html) {
  const text = htmlText(html);
  const m = text.match(/Fon Fiyatı\s*([\d.,]+)\s*TL/);
  if (!m) return null;
  const raw = m[1], price = raw.includes(',') ? trNum(raw) : Number(raw);
  if (!(price > 0)) return null;
  return { price, decimals: decimalsOf(raw.replace(/^.*[.,]/, '0.')) };
}

/** TEFAS BindHistoryInfo yanıtı -> en son {price, decimals, date, name} */
export function parseTefas(json, code) {
  const rows = (json && json.data || []).filter(r => String(r.FONKODU || '').toUpperCase() === code && Number(r.FIYAT) > 0);
  if (!rows.length) return null;
  rows.sort((a, b) => Number(b.TARIH) - Number(a.TARIH));
  const r = rows[0];
  const iso = istanbulNow(Number(r.TARIH)).date;
  const raw = String(r.FIYAT);
  return { price: Number(r.FIYAT), decimals: Math.max(decimalsOf(raw), 6), date: ddmmyyyy(iso), name: r.FONUNVAN || '' };
}

const sameAt = (a, b, dec) => Math.abs(Number(a.toFixed(dec)) - Number(b.toFixed(dec))) < Math.pow(10, -(dec + 1));
const isMoneyMarket = name => /para\s*piyasas/i.test(String(name || '').toLocaleLowerCase('tr-TR'));

/**
 * Kurallar:
 *  - Fiyat ancak kayıtlıdan FARKLIYSA ve tarihi kayıtlı tarihten eski DEĞİLSE yenidir.
 *  - Daha eski bilinen bir fiyata eşitse alınmaz.
 *  - Para piyasası fonunda fiyat düşemez.
 * Döner: {accept:bool, reason}
 */
export function judgeFund(stored, cand) {
  if (!cand || !(cand.price > 0) || !dmyKey(cand.date)) return { accept: false, reason: 'okunamadı' };
  if (!stored || !(stored.price > 0)) return { accept: true, reason: 'ilk fiyat' };
  const sk = dmyKey(stored.date), ck = dmyKey(cand.date);
  if (sk && ck < sk) return { accept: false, reason: `eski tarih (${cand.date})` };
  const dec = Math.min(cand.decimals || 6, 6);
  if (sameAt(stored.price, cand.price, dec)) return { accept: false, reason: 'aynı fiyat' };
  if (cand.decimals < 6 && ck === sk) return { accept: false, reason: 'aynı gün, daha az hane' };
  for (const h of stored.hist || []) {
    if (dmyKey(h.date) < ck && sameAt(h.price, cand.price, dec)) return { accept: false, reason: `eski fiyata eşit (${h.date})` };
  }
  if (isMoneyMarket(stored.name || cand.name) && cand.price < stored.price) return { accept: false, reason: 'para piyasası fonu düşemez' };
  if (tooFar(stored.price, cand.price, 0.15)) return { accept: false, reason: '%15’ten fazla fark' };
  return { accept: true, reason: 'yeni' };
}
