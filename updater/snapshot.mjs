// Oktan Hesap Takip — günlük servet kaydı (GitHub Actions'ta çalışır).
// Uygulamayı açmadığın günlerde de o günün toplam değerini "history" koleksiyonuna yazar.
// Ortam değişkenleri:
//   FIREBASE_SERVICE_ACCOUNT  servis hesabı JSON'u (GitHub Secret)
//   DRY_RUN=1                 veritabanına yazma, sadece hesaplananı ve son kayıtla farkını göster
//   OVERWRITE=1               bugün için uygulamanın yazdığı kayıt varsa da üzerine yaz (varsayılan: dokunma)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeSnapshot } from './snapshot-lib.mjs';

const DRY = !!process.env.DRY_RUN, OVERWRITE = process.env.OVERWRITE === '1';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT tanımlı değil (GitHub > Settings > Secrets).'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();

const list = async name => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const doc = async path => { const s = await db.doc(path).get(); return s.exists ? s.data() : null; };

const [tx, fdtx, hold, al, hb, st] = await Promise.all(['tx', 'fundtx', 'holdings', 'alacak', 'hesap', 'statements'].map(list));
const [fdp, harem, fiba, doviz, settings] = await Promise.all(['prices/funds', 'prices/harem', 'prices/fiba', 'prices/doviz', 'settings/main'].map(doc));
const missing = [['prices/funds', fdp], ['prices/harem', harem], ['prices/fiba', fiba]].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error('Fiyat belgesi yok, kayıt atlandı:', missing.join(', ')); process.exit(1); }

const { date, values, incomplete } = computeSnapshot({ tx, fdtx, hold, al, hb, st, settings: settings || {}, fdp, harem, fiba, doviz: doviz || { items: {} } });
console.log(`İstanbul tarihi ${date}${DRY ? ' (DRY_RUN)' : ''}`);
console.log('Hesaplanan:', JSON.stringify(values));
if (incomplete) { console.error('Bir altın/gümüş kaleminin fiyatı yok; yanlış kayıt olmasın diye atlandı.'); process.exit(1); }

const hist = (await db.collection('history').get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
const prev = [...hist].reverse().find(h => h.id !== date && typeof h.ana === 'number');
if (prev) console.log(`Önceki kayıt ${prev.id}: ana ${prev.ana} → bugün ${values.ana} (fark ${Math.round((values.ana - prev.ana) * 100) / 100})`);
const existing = hist.find(h => h.id === date);
if (existing && !OVERWRITE) { console.log('Bugün için kayıt zaten var (uygulama yazmış); dokunulmadı.'); process.exit(0); }
if (DRY) { console.log('[DRY] yazılmadı'); process.exit(0); }
await db.collection('history').doc(date).set({ ...values, t: Date.now(), src: 'server' });
console.log('Kayıt yazıldı:', date);
