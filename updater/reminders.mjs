// Oktan Hesap Takip — kart son ödeme hatırlatıcısı (GitHub Actions'ta her gün öğlen çalışır).
// Son ödeme gününden 1 gün önce ve son gün e-posta gönderir.
// Ortam değişkenleri (GitHub > Settings > Secrets and variables > Actions):
//   FIREBASE_SERVICE_ACCOUNT  servis hesabı JSON'u (fiyat güncelleyiciyle aynı)
//   GMAIL_USER                gönderen Gmail adresi
//   GMAIL_APP_PASSWORD        o hesabın 16 haneli uygulama şifresi
//   MAIL_TO                   (isteğe bağlı) alıcı; boşsa GMAIL_USER
//   APP_URL                   (isteğe bağlı) e-postadaki "Uygulamayı aç" bağlantısı
//   TEST=1                    elle çalıştırma: yaklaşan ödemeleri deneme e-postası olarak gönder
//   DRY_RUN=1                 e-posta gönderme, sadece yazdır
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { istanbulNow } from './lib.mjs';
import { pickDue, buildMail } from './remind-lib.mjs';

const { FIREBASE_SERVICE_ACCOUNT: sa, GMAIL_USER: user, GMAIL_APP_PASSWORD: passRaw, MAIL_TO, APP_URL } = process.env;
const TEST = process.env.TEST === '1', DRY = !!process.env.DRY_RUN;
const appUrl = APP_URL || 'https://oktan-co.github.io/oktan-hesap/';
const fail = m => { console.error(m); process.exit(1); };

if (!sa) fail('FIREBASE_SERVICE_ACCOUNT tanımlı değil (GitHub > Settings > Secrets).');
if (!DRY && (!user || !passRaw)) fail('GMAIL_USER ve GMAIL_APP_PASSWORD tanımlı değil (GitHub > Settings > Secrets). Kurulum: KURULUM.md, "Son ödeme hatırlatması".');

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
  if (meta.exists && meta.data().lastSent === today) { console.log('Bugünün hatırlatması zaten gönderilmiş.'); process.exit(0); }
}
const mail = buildMail(due, { appUrl, test: TEST });
if (!mail) { console.log('Bugün ya da yarın son ödemesi olan ödenmemiş ekstre yok; e-posta gönderilmedi.'); process.exit(0); }

if (DRY) { console.log('[DRY]', mail.subject, '\n' + mail.text); process.exit(0); }
const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: passRaw.replace(/\s+/g, '') } });
try {
  await transport.sendMail({ from: `Oktan Hesap Takip <${user}>`, to: MAIL_TO || user, subject: mail.subject, text: mail.text, html: mail.html });
} catch (e) {
  fail(`E-posta gönderilemedi: ${e && e.message || e}${/535|Username and Password/i.test(String(e && e.message)) ? ' — Gmail uygulama şifresini ve GMAIL_USER adresini kontrol et.' : ''}`);
}
if (!TEST) await metaRef.set({ lastSent: today, at: Date.now() }, { merge: true });
console.log('Gönderildi:', mail.subject);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Hatırlatma ${today}\n\nGönderildi: ${mail.subject}\n`);
}
