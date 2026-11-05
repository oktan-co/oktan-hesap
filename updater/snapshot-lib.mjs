// Servet geçmişi için günlük değer hesabı (GitHub Actions'ta çalışır).
// index.html'deki hesapların (cashUpTo, fundLedger, alFor, bonoInfo, holdValue…) birebir kopyasıdır;
// test/snapshot.test.mjs bu dosyanın sonuçlarını uygulamanın gerçek fonksiyonlarıyla karşılaştırır.
// Uygulamadaki ilgili hesap değişirse bu dosya da güncellenmeli (test uyarır).
import { istanbulNow } from './lib.mjs';

export const OWNERS = ['Emre', 'Merve'];
const REP_CARRY = '2026-10'; // index.html: REP_CARRY
const r2 = v => Math.round(v * 100) / 100;

/* ---- tarih yardımcıları (sunucu saat dilimine bağlı değil) ---- */
const addM = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
const isoAdd = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/* ---- nakit ---- */
function sellNetOf(t, sells) { const i = sells[t.id]; return i ? i.net : t.units * t.price; }
function cashUpTo(M, tx, fdtx, sells) {
  let v = 0;
  for (const t of tx) { if (t.date.slice(0, 7) > M) continue; if (t.type === 'income') v += t.amount; else if (t.type === 'cardpay' || !t.cardId) v -= t.amount; }
  for (const t of fdtx) { if (t.opening || t.date.slice(0, 7) > M) continue; v += t.side === 'sell' ? sellNetOf(t, sells) : -t.units * t.price; }
  return v;
}

/* ---- fonlar: FIFO ---- */
function fifoTake(lots, units, price, rate) {
  let rem = units, cost = 0, sold = 0;
  while (rem > 1e-9 && lots.length) { const l = lots[0], u = Math.min(rem, l.units); cost += u * l.price; sold += u; l.units -= u; rem -= u; if (l.units < 1e-9) lots.shift(); }
  const gross = units * price, gain = sold * price - cost, auto = gain > 0 ? r2(gain * (rate || 0) / 100) : 0;
  return { gross, gain, tax: auto, net: gross - auto };
}
function fundLedger(fdtx, fdp, rates) {
  const P = {}, sells = {};
  const txs = [...fdtx].sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  for (const t of txs) {
    const o = t.owner || OWNERS[0], k = o + '|' + t.code;
    const p = P[k] || (P[k] = { owner: o, code: t.code, lots: [] });
    if (t.side === 'sell') {
      const r = fifoTake(p.lots, t.units, t.price, rates[t.code]);
      if (t.tax != null && isFinite(t.tax) && t.tax >= 0) { r.tax = r2(t.tax); r.net = r.gross - r.tax; }
      sells[t.id] = r;
    } else p.lots.push({ date: t.date, units: t.units, price: t.price });
  }
  const pos = Object.values(P).map(p => {
    p.units = p.lots.reduce((a, l) => a + l.units, 0); p.cost = p.lots.reduce((a, l) => a + l.units * l.price, 0);
    const pr = (fdp.items || {})[p.code]; p.price = pr && pr.price || null;
    p.value = p.price != null ? p.units * p.price : null;
    p.tax = rates[p.code] || 0; p.gross = p.value != null ? p.value - p.cost : null;
    p.taxAmt = p.gross > 0 ? r2(p.gross * p.tax / 100) : 0;
    p.netValue = p.value != null ? p.value - p.taxAmt : null;
    return p;
  });
  return { pos, sells };
}

/* ---- altın / gümüş ---- */
function holdValue(h, harem, fiba) { const src = h.src === 'fiba' ? fiba : harem; const p = (src.items || {})[h.prod]; return p && p.alis ? h.qty * p.alis : null; }

/* ---- alacaklar ---- */
function alacakTotal(al, cur, todayIso) {
  const open = al.filter(a => !a.paid);
  const repLate = (a, M) => { const out = []; let m = (a.date || todayIso).slice(0, 7); if (m < REP_CARRY) m = REP_CARRY; for (; m < M; m = addM(m, 1)) if (!(a.done && a.done[m])) out.push(m); return out; };
  // alFor(cur, cumulative=true)
  let sum = 0;
  for (const a of open) {
    if (a.repeat) {
      sum += repLate(a, cur).length * a.amount;
      const st = (a.date || todayIso).slice(0, 7);
      if (cur < st || (a.done && a.done[cur])) continue;
      sum += a.amount; continue;
    }
    if (!a.date) { sum += a.amount; continue; }
    const am = a.date.slice(0, 7);
    if (am === cur || am < cur) sum += a.amount;
  }
  // alTotalNow: ileri aylara tarihli tek seferlikler de eklenir
  sum += open.filter(x => !x.repeat && x.date && x.date.slice(0, 7) > cur).reduce((s, x) => s + x.amount, 0);
  return sum;
}

/* ---- hesap & bono ---- */
const hbDefTax = d => d <= 365 ? 15 : 10;
function bonoNow(b, todayIso, hour) {
  const days = Math.max(1, b.days || 1), start = b.start || todayIso, tax = Number.isFinite(b.tax) ? b.tax : hbDefTax(days);
  const gross = b.amount * (b.rate || 0) / 100 * days / 365, calcEnd = b.amount + gross * (1 - tax / 100), endNet = b.endAmt > 0 ? b.endAmt : calcEnd;
  const bonoDay = hour < 8 ? isoAdd(todayIso, -1) : todayIso; // 08:00'den önce dünün faizi
  const dd = dBetween(start, bonoDay), el = Math.min(days, Math.max(0, dd));
  return Math.round((b.amount + (endNet - b.amount) * el / days) * 100) / 100;
}
function acctTL(a, doviz) {
  if (!a.cur) return a.amount;
  const it = (doviz.items || {})['enpara_' + String(a.cur).toLowerCase()];
  return it && it.alis > 0 ? Math.round(a.amount * it.alis * 100) / 100 : 0;
}

/**
 * data: Firestore'dan okunan ham koleksiyonlar
 *   {tx, fdtx, hold, al, hb, st, settings, fdp, harem, fiba, doviz}
 * Dönüş: {values, incomplete}  (values: history belgesine yazılacak alanlar)
 */
export function computeSnapshot(data, nowMs = Date.now()) {
  const n = istanbulNow(nowMs), todayIso = n.date, cur = todayIso.slice(0, 7), hour = Math.floor(n.mins / 60);
  // uygulamadaki süzgeçler
  const tx = (data.tx || []).filter(t => t.date && t.amount > 0);
  const fdtx = (data.fdtx || []).filter(t => t.code && t.units > 0 && t.price > 0 && t.date);
  const al = (data.al || []).filter(a => Number.isFinite(a.amount) && a.amount !== 0);
  const hb = (data.hb || []).filter(x => Number.isFinite(x.amount));
  const st = (data.st || []).filter(x => x.amount > 0 || x.pending);
  const hold = data.hold || [];
  const fdp = data.fdp || { items: {} }, harem = data.harem || { items: {} }, fiba = data.fiba || { items: {} }, doviz = data.doviz || { items: {} };
  const rates = (data.settings || {}).fundTax || {};

  const { pos, sells } = fundLedger(fdtx, fdp, rates);
  const cash = cashUpTo(cur, tx, fdtx, sells);
  const debt = st.filter(x => !x.paid).reduce((a, x) => a + (x.amount || 0), 0);
  const pv = hold.reduce((a, h) => a + (holdValue(h, harem, fiba) || 0), 0);
  const fizik = hold.filter(h => h.src !== 'fiba').reduce((a, h) => a + (holdValue(h, harem, fiba) || 0), 0); // fiziki altın = Harem kalemleri
  const fv = pos.reduce((a, p) => a + (p.units > 1e-9 ? (p.netValue ?? p.cost) : 0), 0);
  const alT = alacakTotal(al, cur, todayIso);
  const hv = hb.filter(x => !x.closed).reduce((a, x) => a + (x.kind === 'bono' ? bonoNow(x, todayIso, hour) : acctTL(x, doviz)), 0);
  const incomplete = hold.some(h => holdValue(h, harem, fiba) == null);

  const v = {
    v: 2, ana: alT + pv + fv + hv - debt, bakiye: cash, alacak: alT, maden: pv, fizik, fon: fv, hesap: hv, borc: debt,
    fonBy: Object.fromEntries(OWNERS.map(o => [o, pos.filter(p => p.owner === o && p.units > 1e-9).reduce((a, p) => a + (p.netValue ?? p.cost), 0)])),
  };
  const values = {};
  for (const [k, x] of Object.entries(v)) values[k] = typeof x === 'number' ? r2(x) : Object.fromEntries(Object.entries(x).map(([a, b]) => [a, r2(b)]));
  return { date: todayIso, values, incomplete };
}
