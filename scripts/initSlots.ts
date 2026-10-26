import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const dates = ['2026-10-28'] as const;
const bookableTimes = [
  '17:00',
  '17:15',
  '17:30',
  '17:45',
  '18:00',
  '18:15',
  '18:30',
  '18:45',
  '19:00',
  '19:15',
  '19:30',
  '19:45',
] as const;

function makeSlotId(date: string, time: string) {
  return `${date}_${time.replace(':', '-')}`;
}

const projectId = process.env.MOONLIGHT_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('MOONLIGHT_FIREBASE_PROJECT_ID is required. Verify the target project before initializing slots.');

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const db = getFirestore();

async function main() {
  const batch = db.batch();
  let created = 0;
  for (const date of dates) {
    for (const time of bookableTimes) {
      const ref = db.collection('events').doc('moonlight-2026-10-28').collection('slots').doc(makeSlotId(date, time));
      const snap = await ref.get();
      if (snap.exists) continue;

      batch.set(ref, {
        date,
        time,
        status: 'available',
        bookingId: null,
        blockedReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }

  batch.set(
    db.collection('events').doc('moonlight-2026-10-28').collection('settings').doc('reservation'),
    {
      status: 'OPEN',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  console.log(`Initialized ${created} MoonLight slots. Existing slots were left unchanged.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
