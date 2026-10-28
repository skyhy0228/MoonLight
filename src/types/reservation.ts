import type { Timestamp } from 'firebase/firestore';

export type EventDate = '2026-10-29';
export type SlotStatus = 'available' | 'reserved' | 'blocked';
export type BookingStatus = 'submitted' | 'confirmed' | 'cancelled';
export type PaymentStatus = 'unverified' | 'confirmed' | 'needs_review';
export type ReservationStatus = 'OPEN' | 'CLOSED';

export interface Slot {
  id: string;
  date: EventDate;
  time: string;
  status: SlotStatus;
  clientStatusLabel?: string;
  bookingId?: string | null;
  blockedReason?: string | null;
  updatedAt?: Timestamp;
}

export interface Booking {
  accessKey: string;
  bookingCode: string;
  managementCodeHash: string;
  representativeName: string;
  phone: string;
  normalizedPhone: string;
  phoneHash: string;
  affiliation?: string;
  teamSize: number;
  date: EventDate;
  time: string;
  slotId: string;
  depositorName: string;
  expectedDeposit: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  privacyConsent: true;
  ownerUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  cancelledAt?: Timestamp | null;
  modifiedAfterConfirmation: boolean;
}

export interface BookingReceipt {
  booking: Booking;
}

export interface BookingLookup {
  accessKey: string;
  ownerUid: string;
  createdAt?: Timestamp;
}

export interface ReservationSettings {
  status: ReservationStatus;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface BookingFormData {
  date: EventDate;
  time: string;
  teamSize: number;
  representativeName: string;
  phone: string;
  affiliation: string;
  depositorName: string;
  privacyConsent: boolean;
}
