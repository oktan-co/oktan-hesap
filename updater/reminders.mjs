// Oktan Hesap Takip — kart son ödeme hatırlatıcısı (GitHub Actions'ta çalışır, telefona bildirim gönderir).
// Son ödeme gününden 1 gün önce ve son gün bildirim gönderir; son gün ödenmemişse akşam tekrarları (SLOT) vardır.
// Ortam değişkenleri (GitHub > Settings > Secrets and variables > Actions):
//   FIREBASE_SERVICE_ACCOUNT  servis hesabı JSON'u (fiyat güncelleyiciyle aynı)
//   SLOT                      boş = öğlen hatırlatması; '21:00' gibi bir saat = son gün akşam hatırlatması
//   TEST=1                    elle çalıştırma: yaklaşan ödemeleri deneme bildirimi olarak gönder
//   DRY_RUN=1                 bildirim gönderme, sadece yazdır
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { istanbulNow } from './lib.mjs';
import { pickDue, buildPush } from './remind-lib.mjs';

const { FIREBASE_SERVICE_ACCOUNT: sa } = process.env;
const TEST = process.env.TEST === '1', DRY = !!process.env.DRY_RUN;
const SLOT = /^\d{2}:\d{2}$/.test(process.env.SLOT || '') ? process.env.SLOT : '';
const sentKey = SLOT ? 'sent_' + SLOT.replace(':', '') : 'lastSent';
const fail = m => { console.error(m); process.exit(1); };

if (!sa) fail('FIREBASE_SERVICE_ACCOUNT tanımlı değil (GitHub > Settings > Secrets).');

initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();
const today = istanbulNow().date;

const [stSnap, cardSnap, metaRef] = await Promise.all([
  db.collection('statements').get(),
  db.collection('cards').get(),
  Promise.resolve(db.doc('meta/reminders')),
]);
const statements = stSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const cards = cardSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const due = pickDue(statements, cards, today);
console.log(`İstanbul tarihi ${today} · bugün ${due.today.length}, yarın ${due.tomorrow.length} ödeme${TEST ? ' · DENEME' : ''}${DRY ? ' · DRY_RUN' : ''}`);

if (!TEST) {
  const meta = await metaRef.get();
  if (meta.exists && meta.data()[sentKey] === today) { console.log(`Bugünün ${SLOT || 'öğlen'} hatırlatması zaten gönderilmiş.`); process.exit(0); }
}
if (SLOT && !due.today.length && !TEST) { console.log(`${SLOT}: bugün son günü olan ödenmemiş ekstre yok; bildirim gönderilmedi.`); process.exit(0); }
const push = buildPush(due, { test: TEST, late: SLOT });
if (!push) { console.log('Bugün ya da yarın son ödemesi olan ödenmemiş ekstre yok; bildirim gönderilmedi.'); process.exit(0); }

if (DRY) { console.log('[DRY]', push.title, '\n' + push.body); process.exit(0); }

const devices = await db.collection('devices').get();
// Android uygulaması (APK) kuruluysa telefonlar hatırlatmayı kendi alarmıyla gösterir;
// aynı bildirim Chrome'dan ikinci kez gelmesin diye Android tarayıcılarına gönderilmez (bilgisayara gider).
const plans = await db.collection('alarmPlans').get();
const nativeOn = plans.docs.some(d => Date.now() - (d.data().nativeAt || 0) < 24 * 3600e3);
const targets = devices.docs.filter(d => !(nativeOn && /Android/i.test(d.data().ua || '')));
if (nativeOn) console.log(`Telefon uygulaması etkin: ${devices.size - targets.length} Android tarayıcısı atlandı.`);
if (!targets.length && nativeOn) { if (!TEST) await metaRef.set({ [sentKey]: today, at: Date.now() }, { merge: true }); console.log('Bildirim telefon alarmıyla gösterilecek.'); process.exit(0); }
if (!targets.length) fail('Kayıtlı cihaz yok. Uygulamada ⚙ Ayarlar → Bildirim → "Bildirimleri aç" ile telefonu kaydet.');
let ok = 0, bad = 0;
for (const doc of targets) {
  const token = doc.data().token || doc.id;
  try {
    await getMessaging().send({
      token,
      data: { title: push.title, body: push.body, tag: push.tag },
      webpush: { headers: { Urgency: 'high', TTL: '10800' } },
    });
    ok++;
  } catch (e) {
    bad++;
    console.log('Gönderilemedi:', e.code || e.message);
    if (/registration-token-not-registered|invalid-registration-token/.test(e.code || '')) await doc.ref.delete();
  }
}
if (!ok) fail(`Bildirim hiçbir cihaza gönderilemedi (${bad} hata).`);
if (!TEST) await metaRef.set({ [sentKey]: today, at: Date.now() }, { merge: true });
console.log(`Gönderildi: ${push.title} (${ok} cihaz${bad ? ', ' + bad + ' hata' : ''})`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Hatırlatma ${today}\n\nGönderildi: ${push.title} (${ok} cihaz)\n`);
}
