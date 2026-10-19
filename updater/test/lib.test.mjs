import test from 'node:test';
import assert from 'node:assert/strict';
import { trNum, usNum, parseDoviz, stampFor, storedKey, parseBloomberg, parseTefas, judgeFund, istanbulNow } from '../lib.mjs';

const DOVIZ = `<html><head><script>var x="Son (01:00) Alış / Satış 1,00 / 2,00"</script></head><body>
<nav><a>Gram Altın 6.600,00</a></nav>
<h1>Gram Altın <span>Harem Gram Altın</span></h1><ul><li>Veri Akışı Anlıktır</li></ul>
<div class="x"><span>Son</span> <span>(22:56)</span></div><div>6.617,79</div><div>%-0,57 (-37,94)</div>
<div><span>Alış</span> / <span>Satış</span></div><div><span>6.537,01</span> / <span>6.617,79</span></div></body></html>`;

test('Türk sayı biçimi', () => {
  assert.equal(trNum('6.602,18'), 6602.18);
  assert.equal(trNum('104.819,00'), 104819);
  assert.equal(trNum('90,61'), 90.61);
  assert.ok(Number.isNaN(trNum('abc')));
  assert.equal(usNum('6.40425'), 6.40425);
  assert.equal(usNum('3,575,590,000'), 3575590000);
});

test('doviz.com sayfası', () => {
  assert.deepEqual(parseDoviz(DOVIZ), { alis: 6537.01, satis: 6617.79, t: '22:56' });
  assert.equal(parseDoviz('<p>bakımdayız</p>'), null);
});

test('gece yarısı geçişi', () => {
  const now = { date: '2026-10-20', hm: '09:05', mins: 545, dow: 2 };
  assert.deepEqual(stampFor('22:35', now), { d: '2026-10-19', key: '2026-10-19 22:35' });
  assert.deepEqual(stampFor('09:04', now), { d: '2026-10-20', key: '2026-10-20 09:04' });
  // eski kayıt (d yok): updatedAt 19.10 22:36 İstanbul
  const upd = Date.parse('2026-10-19T19:36:00Z');
  assert.equal(storedKey({ t: '22:35' }, upd), '2026-10-19 22:35');
  assert.ok(stampFor('09:04', now).key > storedKey({ t: '22:35' }, upd));
  assert.equal(istanbulNow(upd).hm, '22:36');
});

test('Bloomberg HT ve TEFAS', () => {
  const b = parseBloomberg('<h2>Son Fiyat Bilgileri - 19/10/2026</h2><table><tr><td>Fiyatı</td><td>6.40425</td></tr><tr><td>Portföy Değeri</td><td>3,575,590,000</td></tr></table>');
  assert.deepEqual(b, { price: 6.40425, decimals: 5, date: '19.10.2026' });
  const t = parseTefas({ data: [
    { TARIH: String(Date.parse('2026-10-16T21:00:00Z')), FONKODU: 'IDL', FONUNVAN: 'AKTİF PORTFÖY PARA PİYASASI (TL) FONU', FIYAT: 6.398 },
    { TARIH: String(Date.parse('2026-10-19T21:00:00Z')), FONKODU: 'IDL', FONUNVAN: 'AKTİF PORTFÖY PARA PİYASASI (TL) FONU', FIYAT: 6.410316 },
  ] }, 'IDL');
  assert.equal(t.price, 6.410316); assert.equal(t.date, '20.10.2026');
});

test('fon kuralları', () => {
  const stored = { price: 6.404251, date: '19.10.2026', name: 'AKTİF PORTFÖY PARA PİYASASI (TL) FONU', hist: [{ price: 6.398, date: '16.10.2026' }] };
  assert.equal(judgeFund(stored, { price: 6.40425, decimals: 5, date: '19.10.2026' }).accept, false); // aynı (yuvarlama)
  assert.equal(judgeFund(stored, { price: 6.410316, decimals: 6, date: '20.10.2026' }).accept, true);
  assert.equal(judgeFund(stored, { price: 6.410316, decimals: 6, date: '18.10.2026' }).accept, false); // eski tarih
  assert.equal(judgeFund(stored, { price: 6.398, decimals: 6, date: '20.10.2026' }).accept, false); // eski fiyata eşit / düşüş
  assert.equal(judgeFund(stored, { price: 6.40, decimals: 6, date: '20.10.2026' }).accept, false); // para piyasası düşemez
  assert.equal(judgeFund(stored, { price: 8, decimals: 6, date: '20.10.2026' }).accept, false); // %15
  assert.equal(judgeFund(undefined, { price: 1.23, decimals: 6, date: '20.10.2026' }).accept, true);
});
