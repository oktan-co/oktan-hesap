// Oktan Hesap Takip — fiyat güncelleyici (GitHub Actions'ta çalışır).
// Altın/gümüş: doviz.com tekil ürün sayfaları. Fonlar: TEFAS, olmazsa Bloomberg HT.
// Ortam değişkenleri:
//   FIREBASE_SERVICE_ACCOUNT  servis hesabı JSON'u (GitHub Secret)
//   DRY_RUN=1                 veritabanına yazma, sadece göster
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  istanbulNow, parseDoviz, stampFor, storedKey, tooFar,
  parseBloomberg, parseTefas, judgeFund, ddmmyyyy, addDaysIso,
} from './lib.mjs';

const DRY = !!process.env.DRY_RUN;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let zSeq = 0;
const bust = url => `${url}${url.includes('?') ? '&' : '?'}z=${Date.now()}${String(++zSeq).padStart(2, '0')}`;

async function get(url, opts = {}) {
  const res = await fetch(bust(url), {
    ...opts,
    headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

/* ---------------- altın & gümüş ---------------- */
const PAGES = {
  fiba: {
    altin: 'https://altin.doviz.com/fibabanka/gram-altin',
    gumus: 'https://altin.doviz.com/fibabanka/gumus',
  },
  harem: {
    gram: 'https://altin.doviz.com/harem/gram-altin',
    a22: 'https://altin.doviz.com/harem/22-ayar-bilezik',
    a14: 'https://altin.doviz.com/harem/14-ayar-bilezik',
    ceyrek_eski: 'https://altin.doviz.com/harem/eski-ceyrek-altin',
    yarim_eski: 'https://altin.doviz.com/harem/eski-yarim-altin',
    tam_eski: 'https://altin.doviz.com/harem/eski-tam-altin',
    ata_eski: 'https://altin.doviz.com/harem/eski-ata-altin',
    gremse_eski: 'https://altin.doviz.com/harem/eski-gremse-altin',
    gumus: 'https://altin.doviz.com/harem/gumus',
  },
};

async function readPage(url, now) {
  const marketOpen = now.dow !== 0 && now.mins >= 9 * 60 && now.mins <= 22 * 60;
  let best = null, lastErr = null, errors = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = parseDoviz(await (await get(url)).text());
      if (!r) throw new Error('sayfa okunamadı');
      const st = stampFor(r.t, now);
      const cand = { ...r, d: st.d, key: st.key };
      if (!best || cand.key > best.key) best = cand;
      const ageMin = (now.mins - (Number(r.t.slice(0, 2)) * 60 + Number(r.t.slice(3)))) + (st.d === now.date ? 0 : 1440);
      if (!marketOpen || ageMin <= 20) break; // yeterince taze
    } catch (e) {
      lastErr = e; errors++;
      if (errors >= 2) break; // hata: bir kez yeniden dene
    }
    await sleep(8000);
  }
  if (!best) throw lastErr || new Error('okunamadı');
  return best;
}

async function updateMetals(db, now, summary) {
  for (const [docId, pages] of Object.entries(PAGES)) {
    const got = {};
    await Promise.all(Object.entries(pages).map(async ([k, url]) => {
      try { got[k] = await readPage(url, now); }
      catch (e) { summary.fail.push(`${docId}/${k} (${e.message})`); }
    }));
    const ref = db.collection('prices').doc(docId);
    const run = async tx => {
      const snap = tx ? await tx.get(ref) : await ref.get();
      const cur = snap.exists ? snap.data() : { items: {} };
      const items = {};
      for (const [k, v] of Object.entries(got)) {
        const old = (cur.items || {})[k];
        if (old && v.key <= storedKey(old, cur.updatedAt)) { summary.same.push(`${docId}/${k} ${v.t}`); continue; }
        if (old && (tooFar(old.alis, v.alis) || tooFar(old.satis, v.satis))) { summary.fail.push(`${docId}/${k} (%15'ten fazla sapma: ${v.alis}/${v.satis})`); continue; }
        items[k] = { ...(old || {}), alis: v.alis, satis: v.satis, t: v.t, d: v.d };
        summary.ok.push(`${docId}/${k} ${v.t}`);
      }
      const data = { items, updatedAt: Date.now(), source: 'doviz.com' };
      if (DRY) { log('[DRY]', docId, JSON.stringify(data)); return; }
      tx ? tx.set(ref, data, { merge: true }) : await ref.set(data, { merge: true });
    };
    if (DRY) await run(null); else await db.runTransaction(run);
  }
}

/* ---------------- fonlar ---------------- */
const FUND_PAGES = JSON.parse(readFileSync(new URL('./funds.json', import.meta.url), 'utf8'));

async function fromTefas(code, now) {
  const body = new URLSearchParams({
    fontip: 'YAT', sfontur: '', fonkod: code, fongrup: '',
    bastarih: ddmmyyyy(addDaysIso(now.date, -10)), bittarih: ddmmyyyy(now.date), fonturkod: '', fonunvantip: '',
  });
  const res = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
    method: 'POST', body,
    headers: {
      'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx', Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error('JSON değil (engellenmiş olabilir)'); }
  const r = parseTefas(j, code);
  return r && { ...r, source: 'TEFAS' };
}

async function fromBloomberg(code) {
  const url = FUND_PAGES[code] && FUND_PAGES[code].bloomberght;
  if (!url) return null;
  const r = parseBloomberg(await (await get(url)).text());
  return r && { ...r, source: 'Bloomberg HT' };
}

async function updateFunds(db, now, summary) {
  const codes = [...new Set((await db.collection('fundtx').get()).docs.map(d => String(d.get('code') || '').toUpperCase()).filter(Boolean))];
  if (!codes.length) { log('Fon işlemi yok, fonlar atlandı.'); return; }
  const ref = db.collection('prices').doc('funds');
  const cands = {};
  for (const code of codes) {
    cands[code] = [];
    for (const [name, fn] of [['TEFAS', () => fromTefas(code, now)], ['Bloomberg HT', () => fromBloomberg(code)]]) {
      try { const r = await fn(); if (r) cands[code].push(r); else log(`${code}: ${name} sonuç yok`); }
      catch (e) { log(`${code}: ${name} hata: ${e.message}`); }
    }
  }
  const run = async tx => {
    const snap = tx ? await tx.get(ref) : await ref.get();
    const cur = snap.exists ? snap.data() : { items: {} };
    const items = { ...(cur.items || {}) };
    let changed = false;
    for (const code of codes) {
      const stored = items[code];
      const ok = [];
      for (const c of cands[code]) {
        const v = judgeFund(stored, c);
        log(`${code}: ${c.source} ${c.price} (${c.date}) -> ${v.accept ? 'KABUL' : 'red'}: ${v.reason}`);
        if (v.accept) ok.push(c);
      }
      if (!ok.length) { summary.fundOld.push(`${code} ${stored ? stored.price + ' (' + stored.date + ')' : 'fiyat yok'}`); continue; }
      ok.sort((a, b) => b.date.split('.').reverse().join('').localeCompare(a.date.split('.').reverse().join('')) || b.decimals - a.decimals);
      const best = ok[0];
      const hist = [...(stored && stored.price ? [{ price: stored.price, date: stored.date }] : []), ...((stored && stored.hist) || [])].slice(0, 10);
      items[code] = { price: best.price, name: best.name || (stored && stored.name) || '', date: best.date, source: best.source, hist };
      changed = true;
      summary.fundNew.push(`${code} ${best.price} (${best.date}, ${best.source})`);
    }
    if (!changed) return;
    const data = { items, updatedAt: Date.now() };
    if (DRY) { log('[DRY] funds', JSON.stringify(data)); return; }
    tx ? tx.set(ref, data) : await ref.set(data);
  };
  if (DRY) await run(null); else await db.runTransaction(run);
}

/* ---------------- ana akış ---------------- */
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT tanımlı değil (GitHub > Settings > Secrets).'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();
const now = istanbulNow();
log(`İstanbul saati ${now.date} ${now.hm}${DRY ? ' (DRY_RUN)' : ''}`);
const summary = { ok: [], same: [], fail: [], fundNew: [], fundOld: [] };
let hardFail = false;
try { await updateMetals(db, now, summary); } catch (e) { hardFail = true; console.error('Altın/gümüş:', e); }
try { await updateFunds(db, now, summary); } catch (e) { hardFail = true; console.error('Fonlar:', e); }

const line = [
  summary.ok.length ? `Güncellendi: ${summary.ok.join(', ')}` : 'Altın/gümüşte yeni fiyat yok',
  summary.same.length ? `Değişmeyen: ${summary.same.length} ürün` : '',
  summary.fail.length ? `Alınamadı: ${summary.fail.join(', ')}` : '',
  summary.fundNew.length ? `Fon: ${summary.fundNew.join(', ')}` : '',
  summary.fundOld.length ? `Fon eski kaldı: ${summary.fundOld.join(', ')}` : '',
].filter(Boolean).join(' · ');
log('\n' + line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Fiyat güncelleme ${now.date} ${now.hm}\n\n${line}\n`);
}
process.exit(hardFail ? 1 : 0);
