import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(database, 'events', 'moonlight-2026-10-29', 'slots', '2026-10-29_17-00'), {
      date: '2026-10-29', time: '17:00', status: 'available', bookingId: null,
    });
    await setDoc(doc(database, 'admins', 'admin-uid'), { role: 'admin' });
  });

  const publicDb = environment.unauthenticatedContext().firestore();
  const guestDb = environment.authenticatedContext('guest-uid').firestore();
  const adminDb = environment.authenticatedContext('admin-uid').firestore();

  await assertFails(setDoc(doc(adminDb, 'events', 'moonlight-2026-10-29', 'slots', '2026-10-28_17-00'), {
    date: '2026-10-28', time: '17:00', status: 'available', bookingId: null,
  }));

  await assertSucceeds(getDoc(doc(publicDb, 'slots', '2026-09-29_13-00')));
  await assertSucceeds(getDoc(doc(publicDb, 'events', 'moonlight-2026-10-29', 'slots', '2026-10-29_17-00')));
  await assertFails(getDocs(collection(guestDb, 'bookings')));
  await assertFails(getDocs(collection(guestDb, 'events', 'moonlight-2026-10-29', 'bookings')));
  await assertSucceeds(getDocs(collection(adminDb, 'events', 'moonlight-2026-10-29', 'bookings')));
  await assertFails(updateDoc(doc(guestDb, 'events', 'moonlight-2026-10-29', 'slots', '2026-10-29_17-00'), {
    status: 'blocked', bookingId: null,
  }));

  const eventPath = ['events', 'moonlight-2026-10-29'];
  const accessKey = 'test-access-key';
  const bookingCode = 'MOON-1029-ABCDE';
  const phoneHash = 'test-phone-hash';
  const slotRef = doc(guestDb, ...eventPath, 'slots', '2026-10-29_17-00');
  const bookingRef = doc(guestDb, ...eventPath, 'bookings', accessKey);
  const lookupRef = doc(guestDb, ...eventPath, 'bookingLookups', bookingCode);
  const lockRef = doc(guestDb, ...eventPath, 'representativeLocks', phoneHash);

  await assertSucceeds(runTransaction(guestDb, async (transaction) => {
    const slot = await transaction.get(slotRef);
    if (!slot.exists() || slot.data().status !== 'available') throw new Error('Test slot unavailable');
    transaction.set(bookingRef, {
      accessKey, bookingCode, managementCodeHash: 'test-management-hash',
      representativeName: 'Test', phone: '010-1234-5678', normalizedPhone: '01012345678', phoneHash,
      affiliation: 'Test', teamSize: 4, date: '2026-10-29', time: '17:00', slotId: slotRef.id,
      depositorName: 'Test', expectedDeposit: 4000, bookingStatus: 'submitted', paymentStatus: 'unverified',
      privacyConsent: true, ownerUid: 'guest-uid', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      cancelledAt: null, modifiedAfterConfirmation: false,
    });
    transaction.set(lookupRef, { accessKey, ownerUid: 'guest-uid', createdAt: serverTimestamp() });
    transaction.update(slotRef, { status: 'reserved', bookingId: accessKey, blockedReason: null, updatedAt: serverTimestamp() });
    transaction.set(lockRef, { bookingId: accessKey, phoneHash, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }));

  const reservedSlot = await getDoc(slotRef);
  if (reservedSlot.data()?.bookingId !== accessKey) throw new Error('Booking transaction did not reserve slot');
  console.log('Firestore rules: legacy access, isolation, and MoonLight booking transaction passed.');
} finally {
  await environment.cleanup();
}
