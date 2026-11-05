// Sunucudaki günlük hesap (snapshot-lib.mjs), uygulamanın (index.html) gerçek fonksiyonlarıyla aynı sonucu vermeli.
process.env.TZ = 'Europe/Istanbul';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { computeSnapshot } from '../snapshot-lib.mjs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').split('\n');
const line = s => { const i = html.findIndex(l => l.startsWith(s)); assert.ok(i >= 0, 'index.html\'te bulunamadı: ' + s); return i; };
const seg = (a, b) => html.slice(line(a), line(b) + 1).join('\n');

const code = [
  html[line('const mk=')], html[line('const addM=')], html[line('const isoToday=')],
  html[line('const alIso=')], html[line('const isoAdd=')],
  seg('function cashUpTo(M)', 'function holdValue'),
  seg('const alDay=', 'function alTotalNow'),
  seg('const hbDefTax', 'function hbValue'),
].join('\n');

function appValues(data, nowMs) {
  const RealDate = Date;
  class FD extends RealDate { constructor(...a) { a.length ? super(...a) : super(nowMs); } static now() { return nowMs; } }
  const ctx = vm.createContext({ S: null, OWNERS: ['Emre', 'Merve'], Date: FD, Intl, Math, Number, JSON, Object, Array, String, isFinite, console });
  vm.runInContext('const today=new Date();', ctx);
  ctx.S = {
    tx: data.tx.filter(t => t.date && t.amount > 0), fdtx: data.fdtx.filter(t => t.code && t.units > 0 && t.price > 0 && t.date),
    hold: data.hold, al: data.al.filter(a => Number.isFinite(a.amount) && a.amount !== 0), hb: data.hb.filter(x => Number.isFinite(x.amount)),
    st: data.st.filter(x => x.amount > 0 || x.pending), settings: data.settings, fdp: data.fdp, harem: data.harem, fiba: data.fiba, doviz: data.doviz,
  };
  const out = vm.runInContext(code + `
;(()=>{const M=mk(today);const debt=S.st.filter(x=>!x.paid).reduce((a,x)=>a+(x.amount||0),0);
const pv=S.hold.reduce((a,h)=>a+(holdValue(h)||0),0);const FP=fundPositions();const fv=FP.reduce((a,p)=>a+(p.units>1e-9?(p.netValue??p.cost):0),0);
const alT=alTotalNow(),hv=hbValue(),cash=cashUpTo(M);
return {ana:cash+alT+pv+fv+hv-debt,bakiye:cash,alacak:alT,maden:pv,fizik:physValue(),fon:fv,hesap:hv,borc:debt}})()`, ctx);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

const data = {
  tx: [
    { id: 't1', date: '2026-10-02', amount: 50000, type: 'income' },
    { id: 't2', date: '2026-10-05', amount: 1200.5, type: 'expense' },
    { id: 't3', date: '2026-10-06', amount: 3000, type: 'expense', cardId: 'c1' },
    { id: 't4', date: '2026-10-20', amount: 8000, type: 'cardpay', cardId: 'c1' },
    { id: 't5', date: '2026-12-01', amount: 999, type: 'income' },
    { id: 't6', date: '', amount: 5, type: 'income' },
  ],
  fdtx: [
    { id: 'f1', date: '2026-09-01', code: 'AAA', units: 100, price: 10, owner: 'Emre', side: 'buy', created: 1 },
    { id: 'f2', date: '2026-09-10', code: 'AAA', units: 50, price: 12, owner: 'Emre', side: 'buy', created: 2 },
    { id: 'f3', date: '2026-10-01', code: 'AAA', units: 120, price: 15, owner: 'Emre', side: 'sell', created: 3 },
    { id: 'f4', date: '2026-10-02', code: 'BBB', units: 30, price: 40, owner: 'Merve', side: 'buy', created: 4 },
    { id: 'f5', date: '2026-10-03', code: 'BBB', units: 10, price: 45, owner: 'Merve', side: 'sell', tax: 7.5, created: 5 },
    { id: 'f6', date: '2026-08-01', code: 'CCC', units: 5, price: 100, owner: 'Emre', side: 'buy', opening: true, created: 6 },
    { id: 'f7', date: '2026-11-02', code: 'AAA', units: 20, price: 14, side: 'buy', created: 7 },
  ],
  hold: [{ id: 'h1', src: 'harem', prod: 'gram', qty: 10 }, { id: 'h2', src: 'fiba', prod: 'gumus', qty: 200 }],
  al: [
    { id: 'a1', amount: 1000, date: '' },
    { id: 'a2', amount: 2500, date: '2026-10-15' },
    { id: 'a3', amount: 700, date: '2026-12-20' },
    { id: 'a4', amount: 300, date: '2026-10-03', repeat: true, done: { '2026-10': true } },
    { id: 'a5', amount: 400, date: '2026-09-10', repeat: true },
    { id: 'a6', amount: 900, date: '2026-10-01', paid: '2026-10-30' },
    { id: 'a7', amount: 150, repeat: true },
  ],
  hb: [
    { id: 'b1', kind: 'bono', amount: 100000, rate: 45, days: 32, start: '2026-10-25' },
    { id: 'b2', kind: 'bono', amount: 50000, rate: 40, days: 400, start: '2026-09-01', tax: 10, endAmt: 70000 },
    { id: 'b3', kind: 'hesap', amount: 12345.67 },
    { id: 'b4', kind: 'hesap', amount: 200, cur: 'USD' },
    { id: 'b5', kind: 'bono', amount: 1000, rate: 40, days: 30, start: '2026-08-01', closed: '2026-09-01' },
  ],
  st: [{ id: 's1', amount: 25615.97, paid: false }, { id: 's2', amount: 0, pending: true, paid: false }, { id: 's3', amount: 500, paid: true }, { id: 's4', amount: 0, paid: false }],
  settings: { fundTax: { AAA: 17.5, BBB: 10 } },
  fdp: { items: { AAA: { price: 18.25, name: 'A fon' }, BBB: { price: 55 }, CCC: { price: 90 } } },
  harem: { items: { gram: { alis: 5400.5 } } },
  fiba: { items: { gumus: { alis: 62.3 } } },
  doviz: { items: { enpara_usd: { alis: 42.15 } } },
};

for (const [label, iso] of [['sabah 07:00', '2026-11-05T04:00:00Z'], ['akşam 23:00', '2026-11-05T20:00:00Z'], ['ay başı', '2026-12-01T09:00:00Z'], ['ay sonu', '2026-10-31T20:00:00Z']]) {
  test(`uygulamayla aynı sonuç — ${label}`, () => {
    const now = Date.parse(iso);
    const app = appValues(data, now), srv = computeSnapshot(data, now);
    const { fonBy, ...rest } = srv.values;
    assert.deepEqual(rest, app);
    assert.ok(fonBy.Emre >= 0 && fonBy.Merve >= 0);
    assert.ok(app.fizik > 0 && app.fizik < app.maden, 'fiziki altın = Harem kalemleri, Fiba hariç');
  });
}

test('fiyatı olmayan altın kalemi eksik sayılır', () => {
  const r = computeSnapshot({ ...data, harem: { items: {} } }, Date.parse('2026-11-05T20:00:00Z'));
  assert.equal(r.incomplete, true);
});
