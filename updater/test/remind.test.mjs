import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDue, buildMail, money } from '../remind-lib.mjs';

const cards = [{ id: 'c1', name: 'Emre Akbank' }, { id: 'c2', name: 'Garanti Bonus' }];
const st = [
  { cardId: 'c1', due: '2026-10-21', amount: 25615.97, paid: false },
  { cardId: 'c2', due: '2026-10-21', amount: 0, pending: true, paid: false },
  { cardId: 'c2', due: '2026-10-20', amount: 1200, paid: false },
  { cardId: 'c1', due: '2026-10-21', amount: 500, paid: true },
  { cardId: 'c1', due: '2026-11-20', amount: 0, paid: false },
];

test('bugün ve yarın ayrılır, ödenenler ve tutarsız-beklemeyenler atlanır', () => {
  const d = pickDue(st, cards, '2026-10-20');
  assert.deepEqual(d.today.map(s => s.card), ['Garanti Bonus']);
  assert.deepEqual(d.tomorrow.map(s => [s.card, s.amount]), [['Emre Akbank', 25615.97], ['Garanti Bonus', null]]);
});

test('ay sonundan sonraki gün', () => {
  const d = pickDue([{ cardId: 'c1', due: '2026-11-01', amount: 10, paid: false }], cards, '2026-10-31');
  assert.equal(d.tomorrow.length, 1);
});

test('konu: tek kart yarın', () => {
  const m = buildMail(pickDue([st[0]], cards, '2026-10-20'), { appUrl: 'https://x' });
  assert.equal(m.subject, `⚠️ YARIN SON GÜN: Emre Akbank ${money(25615.97)}`);
  assert.equal(m.priority, 'normal');
  assert.match(m.text, /21 Ekim Çarşamba/);
  assert.match(m.html, /https:\/\/x/);
});

test('konu: bugün önceliklidir; tutarsız ekstre belirtilir', () => {
  const m = buildMail(pickDue(st, cards, '2026-10-20'), {});
  assert.match(m.subject, /^🔴 BUGÜN SON GÜN: Garanti Bonus .* · yarın 2 kart daha$/);
  assert.equal(m.priority, 'high');
  assert.match(m.text, /YARIN SON GÜN/);
  assert.match(m.html, /Toplam:/);
  assert.match(m.text, /tutar henüz girilmedi/);
});

test('ödeme yoksa e-posta yok; deneme modunda yine gönderilir', () => {
  assert.equal(buildMail(pickDue([], cards, '2026-10-20'), {}), null);
  const t = buildMail(pickDue(st, cards, '2026-10-20'), { test: true });
  assert.match(t.subject, /^🧪 Deneme · 🔴 BUGÜN SON GÜN/);
  const u = buildMail(pickDue([{ cardId: 'c1', due: '2026-10-25', amount: 10, paid: false }], cards, '2026-10-20'), { test: true });
  assert.match(u.html, /5 GÜN KALDI/);
});

test('HTML kaçışı', () => {
  const m = buildMail(pickDue([{ cardId: 'x', due: '2026-10-21', amount: 1, paid: false, note: '<b>' }], [{ id: 'x', name: 'A&B' }], '2026-10-20'), {});
  assert.match(m.html, /A&amp;B/);
  assert.doesNotMatch(m.html, /<b>&lt;|<b><b>/);
});

test('son gün akşam hatırlatması: yalnızca bugün, sert görünüm', () => {
  const m = buildMail(pickDue(st, cards, '2026-10-20'), { late: '23:30' });
  assert.match(m.subject, /^⏰ HÂLÂ ÖDENMEDİ: Garanti Bonus .* · bugün son gün \(23:30\)$/);
  assert.doesNotMatch(m.text, /YARIN SON GÜN/);
  assert.match(m.html, /gün bitimine 30 dk kaldı/);
  assert.match(buildMail(pickDue(st, cards, '2026-10-20'), { late: '21:00' }).html, /3 saat kaldı/);
  assert.equal(buildMail(pickDue([st[0]], cards, '2026-10-20'), { late: '22:00' }), null);
});
