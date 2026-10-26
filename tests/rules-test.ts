import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const environment = await initializeTestEnvironment({
  projectId: 'demo-moonlight',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

try {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'slots', '2026-09-29_13-00'), {
      date: '2026-09-29', time: '13:00', status: 'available', bookingId: null,
    });
    await setDoc(doc(database, 'events', 'moonlight-2026-10-28', 'slots', '2026-10-28_17-00'), {
      date: '2026-10-28', time: '17:00', status: 'available', bookingId: null,
    });
    await setDoc(doc(database, 'admins', 'admin-uid'), { role: 'admin' });
  });

  const publicDb = environment.unauthenticatedContext().firestore();
  const guestDb = environment.authenticatedContext('guest-uid').firestore();
  const adminDb = environment.authenticatedContext('admin-uid').firestore();

  await assertSucceeds(getDoc(doc(publicDb, 'slots', '2026-09-29_13-00')));
  await assertSucceeds(getDoc(doc(publicDb, 'events', 'moonlight-2026-10-28', 'slots', '2026-10-28_17-00')));
  await assertFails(getDocs(collection(guestDb, 'bookings')));
  await assertFails(getDocs(collection(guestDb, 'events', 'moonlight-2026-10-28', 'bookings')));
  await assertSucceeds(getDocs(collection(adminDb, 'events', 'moonlight-2026-10-28', 'bookings')));
  await assertFails(updateDoc(doc(guestDb, 'events', 'moonlight-2026-10-28', 'slots', '2026-10-28_17-00'), {
    status: 'blocked', bookingId: null,
  }));
  console.log('Firestore rules: legacy access, MoonLight access, and isolation checks passed.');
} finally {
  await environment.cleanup();
}
