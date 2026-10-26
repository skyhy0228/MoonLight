import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '../firebase/app';
import { ACCOUNT, EVENT_DOCUMENT_PATH, slotId } from '../config/event';
import type { Booking, BookingFormData, BookingLookup, BookingReceipt, EventDate, ReservationSettings, Slot } from '../types/reservation';
import {
  createAccessKey,
  createBookingCode,
  createManagementCode,
  isValidBookingCode,
  normalizeBookingCode,
  normalizeManagementCode,
  sha256,
} from '../utils/crypto';
import { calculateDeposit, formatPhone, normalizePhone } from '../utils/format';
import { validateBookingForm } from '../utils/validation';
import { ensureAnonymousUser } from './authService';

const reservationClosedMessage = '현재 예약 접수가 마감되었습니다.';
const slotTakenMessage = '방금 다른 사용자가 해당 시간을 예약했습니다. 다른 시간을 선택해주세요.';
const duplicateRepresentativeMessage =
  '이미 예약된 내역이 있습니다. 한 대표자는 하나의 예약만 가능합니다. 기존 예약을 변경하려면 예약 조회/변경 메뉴를 이용해주세요.';

export function humanizeFirebaseError(error: unknown) {
  const code = (error as FirestoreError | undefined)?.code;
  const message = (error as Error | undefined)?.message || '';
  if (code === 'permission-denied') {
    if (message.includes('representativeLocks')) return duplicateRepresentativeMessage;
    return '권한이 없어 요청을 완료하지 못했습니다. 입력값을 확인하거나 새로고침 후 다시 시도해주세요.';
  }
  if (code === 'unavailable') return '인터넷 연결 또는 Firebase 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
  if (code === 'aborted') return '동시에 여러 요청이 발생했습니다. 다시 한 번 시도해주세요.';
  if (message) return message;
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

export function watchSlots(callback: (slots: Slot[]) => void, onError: (message: string) => void) {
  const slotsQuery = query(collection(db, ...EVENT_DOCUMENT_PATH, 'slots'), orderBy('date'), orderBy('time'));
  return onSnapshot(
    slotsQuery,
    (snapshot) => {
      callback(snapshot.docs.map((slotDoc) => ({ id: slotDoc.id, ...slotDoc.data() }) as Slot));
    },
    (error) => onError(humanizeFirebaseError(error)),
  );
}

export function watchReservationSettings(callback: (settings: ReservationSettings) => void) {
  return onSnapshot(doc(db, ...EVENT_DOCUMENT_PATH, 'settings', 'reservation'), (snapshot) => {
    callback((snapshot.data() as ReservationSettings | undefined) || { status: 'OPEN' });
  });
}

export async function createBooking(form: BookingFormData): Promise<BookingReceipt> {
  const validationMessage = validateBookingForm(form);
  if (validationMessage) throw new Error(validationMessage);

  const settingsSnap = await getDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'settings', 'reservation'));
  const settings = settingsSnap.data() as ReservationSettings | undefined;
  if (settings?.status === 'CLOSED') throw new Error(reservationClosedMessage);

  const user = await ensureAnonymousUser();
  const normalizedPhone = normalizePhone(form.phone);
  const phoneHash = await sha256(normalizedPhone);
  const bookingCode = createBookingCode(form.date);
  const managementCode = createManagementCode();
  const accessKey = await createAccessKey(bookingCode, managementCode);
  const managementCodeHash = await sha256(normalizeManagementCode(managementCode));
  const selectedSlotId = slotId(form.date, form.time);
  const bookingRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', accessKey);
  const lookupRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookingLookups', bookingCode);
  const slotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', selectedSlotId);
  const lockRef = doc(db, ...EVENT_DOCUMENT_PATH, 'representativeLocks', phoneHash);
  const expectedDeposit = calculateDeposit(form.teamSize);

  const booking: Booking = {
    accessKey,
    bookingCode,
    managementCodeHash,
    representativeName: form.representativeName.trim(),
    phone: formatPhone(form.phone),
    normalizedPhone,
    phoneHash,
    affiliation: form.affiliation.trim(),
    teamSize: form.teamSize,
    date: form.date,
    time: form.time,
    slotId: selectedSlotId,
    depositorName: form.depositorName.trim(),
    expectedDeposit,
    bookingStatus: 'submitted',
    paymentStatus: 'unverified',
    privacyConsent: true,
    ownerUid: user.uid,
    cancelledAt: null,
    modifiedAfterConfirmation: false,
  };

  try {
    await runTransaction(db, async (transaction) => {
      const slotSnap = await transaction.get(slotRef);
      const lookupSnap = await transaction.get(lookupRef);
      if (!slotSnap.exists()) throw new Error('예약 슬롯이 아직 초기화되지 않았습니다. 운영진에게 문의해주세요.');
      if (lookupSnap.exists()) throw new Error('예약번호 생성 중 충돌이 발생했습니다. 다시 시도해주세요.');
      const slot = slotSnap.data() as Slot;
      if (slot.status !== 'available') throw new Error(slotTakenMessage);

      transaction.set(bookingRef, {
        ...booking,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(lookupRef, {
        accessKey,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      transaction.update(slotRef, {
        status: 'reserved',
        bookingId: accessKey,
        blockedReason: null,
        updatedAt: serverTimestamp(),
      });
      transaction.set(lockRef, {
        bookingId: accessKey,
        phoneHash,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if ((error as FirestoreError | undefined)?.code === 'permission-denied') {
      throw new Error(duplicateRepresentativeMessage);
    }
    throw new Error(humanizeFirebaseError(error));
  }

  return { booking };
}

export async function getBookingByCode(bookingCode: string) {
  await ensureAnonymousUser();
  const normalizedCode = normalizeBookingCode(bookingCode);
  if (!isValidBookingCode(normalizedCode)) throw new Error('예약번호가 올바르지 않습니다.');

  const lookupSnap = await getDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'bookingLookups', normalizedCode));
  if (!lookupSnap.exists()) throw new Error('예약번호가 올바르지 않습니다.');
  const { accessKey } = lookupSnap.data() as BookingLookup;
  const bookingSnap = await getDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', accessKey));
  if (!bookingSnap.exists()) throw new Error('예약 정보를 찾을 수 없습니다. 운영진에게 문의해주세요.');
  const booking = bookingSnap.data() as Booking;
  if (booking.bookingCode !== normalizedCode) throw new Error('예약 정보를 확인할 수 없습니다. 운영진에게 문의해주세요.');
  return booking;
}

export async function changeBooking(booking: Booking, nextDate: EventDate, nextTime: string, nextTeamSize: number) {
  if (booking.bookingStatus === 'cancelled') throw new Error('이미 취소된 예약은 변경할 수 없습니다.');
  const nextSlotId = slotId(nextDate, nextTime);
  const nextDeposit = calculateDeposit(nextTeamSize);
  const bookingRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', booking.accessKey);
  const oldSlotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', booking.slotId);
  const nextSlotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', nextSlotId);
  const paymentStatus = booking.paymentStatus === 'confirmed' ? 'needs_review' : booking.paymentStatus;

  try {
    await runTransaction(db, async (transaction) => {
      const currentBookingSnap = await transaction.get(bookingRef);
      if (!currentBookingSnap.exists()) throw new Error('예약 정보를 찾을 수 없습니다.');
      const currentBooking = currentBookingSnap.data() as Booking;
      if (currentBooking.bookingStatus === 'cancelled') throw new Error('이미 취소된 예약입니다.');

      if (currentBooking.slotId !== nextSlotId) {
        const nextSlotSnap = await transaction.get(nextSlotRef);
        if (!nextSlotSnap.exists()) throw new Error('예약 슬롯이 존재하지 않습니다.');
        const nextSlot = nextSlotSnap.data() as Slot;
        if (nextSlot.status !== 'available') throw new Error(slotTakenMessage);

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

      transaction.update(bookingRef, {
        date: nextDate,
        time: nextTime,
        slotId: nextSlotId,
        teamSize: nextTeamSize,
        expectedDeposit: nextDeposit,
        paymentStatus,
        bookingStatus: paymentStatus === 'needs_review' ? 'submitted' : currentBooking.bookingStatus,
        modifiedAfterConfirmation: currentBooking.paymentStatus === 'confirmed',
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    throw new Error(humanizeFirebaseError(error));
  }
}

export async function cancelBooking(booking: Booking) {
  if (booking.bookingStatus === 'cancelled') throw new Error('이미 취소된 예약입니다.');
  const bookingRef = doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', booking.accessKey);
  const slotRef = doc(db, ...EVENT_DOCUMENT_PATH, 'slots', booking.slotId);
  const lockRef = doc(db, ...EVENT_DOCUMENT_PATH, 'representativeLocks', booking.phoneHash);

  try {
    await runTransaction(db, async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists()) throw new Error('예약 정보를 찾을 수 없습니다.');
      const currentBooking = bookingSnap.data() as Booking;
      if (currentBooking.bookingStatus === 'cancelled') throw new Error('이미 취소된 예약입니다.');

      transaction.update(bookingRef, {
        bookingStatus: 'cancelled',
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
    });
  } catch (error) {
    throw new Error(humanizeFirebaseError(error));
  }
}

export async function copyAccountToClipboard() {
  await navigator.clipboard.writeText(`${ACCOUNT.bank} ${ACCOUNT.number} ${ACCOUNT.holder}`);
}

export async function ensureDefaultReservationSettings() {
  await setDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'settings', 'reservation'), { status: 'OPEN', updatedAt: serverTimestamp() }, { merge: true });
}

export async function removeBookingDocumentForLocalRepair(accessKey: string) {
  await deleteDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', accessKey));
}

export async function markBookingNeedsReview(accessKey: string) {
  await updateDoc(doc(db, ...EVENT_DOCUMENT_PATH, 'bookings', accessKey), {
    paymentStatus: 'needs_review',
    modifiedAfterConfirmation: true,
    updatedAt: serverTimestamp(),
  });
}
