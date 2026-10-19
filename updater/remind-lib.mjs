// Hatırlatma e-postası için saf yardımcılar (test edilebilir, ağ/veritabanı kullanmaz).
import { addDaysIso } from './lib.mjs';

const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = v => TRY.format(Math.round((v || 0) * 100) / 100);
export const longDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Ödenmemiş ekstreleri bugün / yarın son ödemeli olarak ayırır; test için yaklaşanları da verir. */
export function pickDue(statements, cards, today) {
  const tomorrow = addDaysIso(today, 1);
  const name = id => (cards.find(c => c.id === id) || {}).name || 'Kart';
  const open = statements
    .filter(s => !s.paid && s.due && (s.amount > 0 || s.pending))
    .map(s => ({ card: name(s.cardId), due: s.due, amount: s.amount > 0 ? s.amount : null, note: s.note || '' }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.card.localeCompare(b.card, 'tr'));
  return {
    today: open.filter(s => s.due === today),
    tomorrow: open.filter(s => s.due === tomorrow),
    upcoming: open.filter(s => s.due >= today).slice(0, 5),
  };
}

const sum = list => list.reduce((a, s) => a + (s.amount || 0), 0);
const amt = s => (s.amount != null ? money(s.amount) : 'tutar henüz girilmedi');
const headline = (list, when) => list.length === 1
  ? `${when} son ödeme günü: ${list[0].card} ${list[0].amount != null ? money(list[0].amount) : ''}`.trim()
  : `${when} son ödeme günü: ${list.length} kart · ${money(sum(list))}${list.some(s => s.amount == null) ? ' +' : ''}`;

/** E-posta konusu ve gövdesi. test=true ise yaklaşan ödemeleri deneme e-postası olarak listeler. */
export function buildMail(due, { appUrl, test = false } = {}) {
  const sections = test
    ? [['Yaklaşan ödemeler', due.upcoming]]
    : [['Bugün son gün', due.today], ['Yarın son gün', due.tomorrow]].filter(([, l]) => l.length);
  if (!sections.length && !test) return null;
  const subject = test
    ? 'Deneme: kart ödeme hatırlatması çalışıyor'
    : due.today.length ? headline(due.today, 'Bugün') : headline(due.tomorrow, 'Yarın');

  const textParts = sections.map(([t, l]) => `${t}:\n` + (l.length ? l.map(s => `- ${s.card}: ${amt(s)} (son ödeme ${longDate(s.due)})${s.note ? ' · ' + s.note : ''}`).join('\n') : '- Yaklaşan ödenmemiş ekstre yok.'));
  const text = [
    test ? 'Bu bir deneme e-postası. Hatırlatmalar her gün öğlen, son ödeme gününden 1 gün önce ve son gün gönderilecek.\n' : '',
    ...textParts,
    '',
    appUrl ? `Uygulamayı aç: ${appUrl}` : '',
    'Ödemeyi yaptıktan sonra uygulamada ekstrenin kutucuğunu işaretlemeyi unutma.',
  ].filter(x => x !== '').join('\n');

  const row = s => `<tr><td style="padding:10px 0;border-top:1px solid #e3e7e2"><b>${esc(s.card)}</b><br><span style="color:#5d6a63;font-size:13px">Son ödeme: ${esc(longDate(s.due))}${s.note ? ' · ' + esc(s.note) : ''}</span></td>
<td style="padding:10px 0;border-top:1px solid #e3e7e2;text-align:right;white-space:nowrap;font-family:Menlo,Consolas,monospace;font-size:15px${s.amount == null ? ';color:#9a6f17' : ''}">${esc(amt(s))}</td></tr>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16201b;max-width:520px;margin:0 auto;padding:8px 4px">
${test ? '<p style="background:#eef3ef;border-radius:8px;padding:10px 12px;font-size:14px">Bu bir deneme e-postası. Hatırlatmalar her gün öğlen, son ödeme gününden <b>1 gün önce</b> ve <b>son gün</b> gönderilecek.</p>' : ''}
${sections.map(([t, l]) => `<h3 style="margin:18px 0 4px;font-size:16px">${esc(t)}</h3>
<table style="width:100%;border-collapse:collapse">${l.length ? l.map(row).join('') : '<tr><td style="padding:10px 0;color:#5d6a63">Yaklaşan ödenmemiş ekstre yok.</td></tr>'}</table>`).join('')}
${appUrl ? `<p style="margin:22px 0 8px"><a href="${esc(appUrl)}" style="background:#1e5a48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;display:inline-block">Uygulamayı aç</a></p>` : ''}
<p style="color:#5d6a63;font-size:13px">Ödemeyi yaptıktan sonra uygulamada ekstrenin kutucuğunu işaretlemeyi unutma.</p>
</div>`;
  return { subject, text, html };
}
