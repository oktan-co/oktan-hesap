// Hatırlatma e-postası için saf yardımcılar (test edilebilir, ağ/veritabanı kullanmaz).
import { addDaysIso } from './lib.mjs';

const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = v => TRY.format(Math.round((v || 0) * 100) / 100);
export const daysLeft = (iso, from) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5);
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
    date: today,
    today: open.filter(s => s.due === today),
    tomorrow: open.filter(s => s.due === tomorrow),
    upcoming: open.filter(s => s.due >= today).slice(0, 5),
  };
}

const sum = list => list.reduce((a, s) => a + (s.amount || 0), 0);
const amt = s => (s.amount != null ? money(s.amount) : 'tutar henüz girilmedi');
const whenTxt = d => (d === 0 ? 'bugün son gün' : d === 1 ? 'yarın son gün' : `${d} gün kaldı`);
/** Gün sayısına göre görünüm: son gün kırmızı, bir gün önce turuncu, diğerleri yeşil. */
const tone = d => d === 0 ? { label: 'BUGÜN SON GÜN', emoji: '🔴', bg: '#C62828', fg: '#FFFFFF', accent: '#C62828', soft: '#FDECEA' }
  : d === 1 ? { label: 'YARIN SON GÜN', emoji: '⚠️', bg: '#F59E0B', fg: '#2B1A00', accent: '#B45309', soft: '#FEF3C7' }
  : { label: `${d} GÜN KALDI`, emoji: '📅', bg: '#1E5A48', fg: '#FFFFFF', accent: '#1E5A48', soft: '#E8F1EC' };
const headline = (list, t) => `${t.emoji} ${t.label}: ${list.length === 1 ? `${list[0].card} ${list[0].amount != null ? money(list[0].amount) : '(tutar girilmedi)'}` : `${list.length} kart · ${money(sum(list))}`}`;

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
function section(d, list) {
  const t = tone(d);
  const items = list.map(s => `<tr><td style="padding:18px 22px;border-top:1px solid #EEF1EE">
<div style="font-size:20px;line-height:1.3;font-weight:700;color:#16201B">${esc(s.card)}</div>
<div style="font-size:${s.amount != null ? 42 : 22}px;line-height:1.15;font-weight:800;color:${s.amount != null ? t.accent : '#B45309'};margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-.01em">${esc(s.amount != null ? money(s.amount) : 'Tutar henüz girilmedi')}</div>
${s.note ? `<div style="font-size:14px;color:#5D6A63;margin-top:6px">${esc(s.note)}</div>` : ''}</td></tr>`).join('');
  return `<tr><td style="padding:0 0 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;background:#FFFFFF;border:1px solid #E3E7E2">
<tr><td bgcolor="${t.bg}" style="background:${t.bg};color:${t.fg};padding:20px 22px">
<div style="font-size:30px;line-height:1.15;font-weight:800;letter-spacing:.02em">${t.emoji} ${t.label}</div>
<div style="font-size:17px;font-weight:600;margin-top:6px">${esc(longDate(list[0].due))}</div></td></tr>
${items}
${list.length > 1 ? `<tr><td bgcolor="${t.soft}" style="background:${t.soft};padding:14px 22px;font-size:17px;font-weight:700;color:#16201B">Toplam: ${esc(money(sum(list)))}${list.some(s => s.amount == null) ? ' + tutarı girilmeyenler' : ''}</td></tr>` : ''}
</table></td></tr>`;
}

/** E-posta konusu, gövdesi ve önceliği. test=true ise aynı görünüm "Deneme" şeridiyle gönderilir. */
export function buildMail(due, { appUrl, test = false } = {}) {
  let groups = [];
  if (due.today.length) groups.push([0, due.today]);
  if (due.tomorrow.length) groups.push([1, due.tomorrow]);
  if (test && !groups.length) {
    const by = new Map();
    for (const s of due.upcoming) { const d = daysLeft(s.due, due.date); if (!by.has(d)) by.set(d, []); by.get(d).push(s); }
    groups = [...by.entries()];
  }
  if (!groups.length && !test) return null;

  let subject = due.today.length ? headline(due.today, tone(0)) + (due.tomorrow.length ? ` · yarın ${due.tomorrow.length} kart daha` : '')
    : due.tomorrow.length ? headline(due.tomorrow, tone(1)) : '';
  if (test) subject = `🧪 Deneme · ${subject || 'Kart ödeme hatırlatması'}`;

  const all = groups.flatMap(([d, l]) => l.map(s => [d, s]));
  const pre = all.length ? all.map(([d, s]) => `${s.card}: ${amt(s)}, ${whenTxt(d)}`).join(' · ') : 'Yaklaşan ödenmemiş ekstre yok.';
  const text = [
    test ? '🧪 Bu bir deneme e-postası; gerçek hatırlatmalar böyle görünecek.\n' : '',
    ...groups.map(([d, l]) => { const t = tone(d); return `${t.emoji} ${t.label} — ${longDate(l[0].due)}\n` + l.map(s => `• ${s.card}: ${amt(s)}${s.note ? ' · ' + s.note : ''}`).join('\n'); }),
    all.length ? '' : 'Yaklaşan ödenmemiş ekstre yok.',
    appUrl ? `\nUygulamayı aç: ${appUrl}` : '',
    'Ödemeyi yaptıktan sonra uygulamada ekstrenin kutucuğunu işaretle; o ekstre için bir daha hatırlatma gelmez.',
  ].filter(x => x !== '').join('\n\n');

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#EEF1EE">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(pre)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#EEF1EE" style="background:#EEF1EE"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:#16201B">
<tr><td style="padding:0 4px 14px;font-size:14px;font-weight:800;color:#1E5A48;letter-spacing:.06em">₺ OKTAN HESAP TAKİP</td></tr>
${test ? `<tr><td style="padding:0 0 14px"><div style="background:#E3ECFF;color:#1D3F8F;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:600">🧪 Bu bir deneme e-postası. Gerçek hatırlatmalar tam olarak böyle görünecek.</div></td></tr>` : ''}
${groups.length ? groups.map(([d, l]) => section(d, l)).join('') : '<tr><td style="padding:0 0 18px;font-size:17px">Yaklaşan ödenmemiş ekstre yok.</td></tr>'}
${appUrl ? `<tr><td style="padding:2px 0 4px"><a href="${esc(appUrl)}" style="display:block;background:#1E5A48;color:#FFFFFF;text-decoration:none;text-align:center;font-size:19px;font-weight:700;padding:17px 20px;border-radius:14px">Uygulamayı aç →</a></td></tr>` : ''}
<tr><td style="padding:16px 4px 0;font-size:14px;line-height:1.5;color:#5D6A63">Ödemeyi yaptıktan sonra uygulamada ekstrenin kutucuğunu işaretle; o ekstre için bir daha hatırlatma gelmez.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html, priority: due.today.length ? 'high' : 'normal' };
}
