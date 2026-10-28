const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function createBookingCode(date: string) {
  const [, month, day] = date.split('-');
  return `MOON-${month}${day}-${randomString(5)}`;
}

export function normalizeBookingCode(code: string) {
  return code.trim().toUpperCase();
}

export function isValidBookingCode(code: string) {
  return /^MOON-1029-[A-Z2-9]{5}$/.test(normalizeBookingCode(code));
}

export function createManagementCode() {
  return `${randomString(4)}-${randomString(4)}-${randomString(4)}`;
}

export function normalizeManagementCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canCreateBooking(slotIsAvailable: boolean, phoneLockExists: boolean) {
  return slotIsAvailable && !phoneLockExists;
}

export async function createAccessKey(bookingCode: string, managementCode: string) {
  return sha256(`${bookingCode.trim().toUpperCase()}:${normalizeManagementCode(managementCode)}`);
}
