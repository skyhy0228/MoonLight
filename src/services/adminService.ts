import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth, db } from '../firebase/app';
import { EVENT_DATES, EVENT_DOCUMENT_PATH, EVENT_TIMES, slotId } from '../config/event';
import type { Booking, BookingStatus, EventDate, PaymentStatus, ReservationSettings, Slot } from '../types/reservation';
import { calculateDeposit } from '../utils/format';
import { humanizeFirebaseError } from './bookingService';

export async function loginAdmin(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const adminSnap = await getDoc(doc(db, 'admins', credential.user.uid));
    if (!adminSnap.exists()) {
      await signOut(auth);
      throw new Error('관리자 권한이 없는 계정입니다.');
    }
    return credential.user;
  } catch (error) {
    throw new Error(humanizeAdminAuthError(error));
  }
}

export async function requestAdminPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('비밀번호를 재설정할 관리자 이메일을 입력해주세요.');

  try {
    auth.languageCode = 'ko';
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (error) {
    throw new Error(humanizeAdminAuthError(error));
  }
}

export async function logoutAdmin() {
  await signOut(auth);
}

export async function isCurrentUserAdmin(user: User | null = auth.currentUser) {
  if (!user) return false;
  const adminSnap = await getDoc(doc(db, 'admins', user.uid));
  return adminSnap.exists();
}

function humanizeAdminAuthError(error: unknown) {
  const code = (error as { code?: string } | undefined)?.code;
  const message = (error as Error | undefined)?.message || '';

  if (message === '관리자 권한이 없는 계정입니다.') return message;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return '이메일 또는 비밀번호가 올바르지 않습니다. 비밀번호를 잊었다면 재설정 메일을 이용해주세요.';
  }
  if (code === 'auth/invalid-email') return '올바른 이메일 주소를 입력해주세요.';
  if (code === 'auth/missing-password') return '비밀번호를 입력해주세요.';
  if (code === 'auth/user-disabled') return '사용이 중지된 관리자 계정입니다.';
  if (code === 'auth/too-many-requests') return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정해주세요.';
  if (code === 'auth/network-request-failed') return '네트워크 연결을 확인한 뒤 다시 시도해주세요.';
  return message || '관리자 인증을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

export function watchAllBookings(callback: (bookings: Booking[]) => void, onError: (message: string) => void) {
  const bookingsQuery = query(collection(db, ...EVENT_DOCUMENT_PATH, 'bookings'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    bookingsQuery,
    (snapshot) => callback(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking)),
    (error) => onError(humanizeFirebaseError(error)),
  );
}

export async function setReservationStatus(status: ReservationSettings['status']) {
  const uid = auth.currentUser?.uid;
  await setDoc(
    doc(db, ...EVENT_DOCUMENT_PATH, 'settings', 'reservation'),
    { status, updatedAt: serverTimestamp(), updatedBy: uid || null },
    { merge: true },
  );
}

export async function initializeMoonlightSlots() {
  const batch = writeBatch(db);
  let created = 0;

  for (const date of EVENT_DATES) {
    for (const time of EVENT_TIMES) {
      const ref = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', slotId(date, time));
      if ((await getDoc(ref)).exists()) continue;
      batch.set(ref, {
        date,
        time,
        status: 'available',
        bookingId: null,
        blockedReason: null,
        updatedAt: serverTimestamp(),
      });
      created += 1;
    }
  }

  await batch.commit();
  return created;
}

export async function confirmPayment(booking: Booking) {
  await updateAdminBooking(booking.accessKey, {
    paymentStatus: 'confirmed',
    bookingStatus: 'confirmed',
    modifiedAfterConfirmation: false,
  });
}

export async function undoPaymentConfirmation(booking: Booking) {
  await updateAdminBooking(booking.accessKey, {
    paymentStatus: 'unverified',
    bookingStatus: booking.bookingStatus === 'confirmed' ? 'submitted' : booking.bookingStatus,
    modifiedAfterConfirmation: false,
  });
}

async function updateAdminBooking(accessKey: string, changes: Partial<Pick<Booking, 'paymentStatus' | 'bookingStatus' | 'modifiedAfterConfirmation'>>) {
  await updateDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', accessKey), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function adminCancelBooking(booking: Booking) {
  const bookingRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', booking.accessKey);
  const slotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', booking.slotId);
  const lockRef = doc(db, ...EVENT_DOCUMENT_PATH, 'representativeLocks', booking.phoneHash);

  await runTransaction(db, async (transaction) => {
    transaction.update(bookingRef, {
      bookingStatus: 'cancelled' satisfies BookingStatus,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(slotRef, {
      status: 'available',
      bookingId: null,
      blockedReason: null,
      updatedAt: serverTimestamp(),
    });
    transaction.delete(lockRef);
    writeAudit(transaction, 'admin_cancel_booking', booking.accessKey, booking, { bookingStatus: 'cancelled' });
  });
}

export async function adminMoveBooking(booking: Booking, nextDate: EventDate, nextTime: string, nextTeamSize: number) {
  const nextSlotId = slotId(nextDate, nextTime);
  const bookingRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', booking.accessKey);
  const oldSlotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', booking.slotId);
  const nextSlotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', nextSlotId);

  await runTransaction(db, async (transaction) => {
    if (booking.slotId !== nextSlotId) {
      const nextSlotSnap = await transaction.get(nextSlotRef);
      if (!nextSlotSnap.exists()) throw new Error('예약 슬롯이 존재하지 않습니다.');
      const nextSlot = nextSlotSnap.data() as Slot;
      if (nextSlot.status !== 'available') throw new Error('선택한 시간은 이미 예약 또는 차단되었습니다.');
      transaction.update(nextSlotRef, {
        status: 'reserved',
        bookingId: booking.accessKey,
        blockedReason: null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(oldSlotRef, {
        status: 'available',
        bookingId: null,
        blockedReason: null,
        updatedAt: serverTimestamp(),
      });
    }

    const after = {
      date: nextDate,
      time: nextTime,
      slotId: nextSlotId,
      teamSize: nextTeamSize,
      expectedDeposit: calculateDeposit(nextTeamSize),
      paymentStatus: 'needs_review' satisfies PaymentStatus,
      modifiedAfterConfirmation: booking.paymentStatus === 'confirmed',
    };

    transaction.update(bookingRef, {
      ...after,
      updatedAt: serverTimestamp(),
    });
    writeAudit(transaction, 'admin_move_booking', booking.accessKey, booking, after);
  });
}

export async function setSlotBlocked(slot: Slot, blocked: boolean, reason: string) {
  if (slot.status === 'reserved') throw new Error('이미 예약된 시간은 차단할 수 없습니다.');
  await updateDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'slots', slot.id), {
    status: blocked ? 'blocked' : 'available',
    blockedReason: blocked ? reason.trim() || '운영진 차단' : null,
    bookingId: null,
    updatedAt: serverTimestamp(),
  });
}

function writeAudit(
  transaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  action: string,
  bookingId: string,
  before: unknown,
  after: unknown,
) {
  const uid = auth.currentUser?.uid || 'unknown';
  const auditRef = doc(collection(db, ...EVENT_DOCUMENT_PATH, 'auditLogs'));
  transaction.set(auditRef, {
    adminUid: uid,
    action,
    bookingId,
    before,
    after,
    timestamp: serverTimestamp(),
  });
}
