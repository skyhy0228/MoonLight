import { describe, expect, it } from 'vitest';
import { canCreateBooking, createBookingCode, isValidBookingCode, normalizeBookingCode, normalizeManagementCode } from './crypto';
import { calculateDeposit, formatPhone, normalizePhone } from './format';
import { isEventDate, isValidKoreanMobile, isValidTeamSize, validateBookingForm } from './validation';
import type { BookingFormData } from '../types/reservation';
import { EVENT_DATES, EVENT_TIMES } from '../config/event';

const validForm: BookingFormData = {
  date: '2026-10-29',
  time: '17:00',
  teamSize: 4,
  representativeName: '홍길동',
  phone: '010-1234-5678',
  affiliation: '연극영화학과',
  depositorName: '홍길동',
  privacyConsent: true,
};

describe('reservation validation', () => {
  it('accepts October 29 and rejects the incorrect event day', () => {
    expect(EVENT_DATES).toEqual(['2026-10-29']);
    expect(isEventDate('2026-10-29')).toBe(true);
    expect(isEventDate('2026-10-28')).toBe(false);
    expect(createBookingCode(validForm.date)).toMatch(/^MOON-1029-[A-Z2-9]{5}$/);
  });

  it('calculates deposit by team size', () => {
    expect(calculateDeposit(2)).toBe(2000);
    expect(calculateDeposit(4)).toBe(4000);
  });

  it('rejects invalid team sizes', () => {
    expect(isValidTeamSize(1)).toBe(false);
    expect(isValidTeamSize(5)).toBe(false);
    expect(isValidTeamSize(2)).toBe(true);
    expect(isValidTeamSize(4)).toBe(true);
  });

  it('normalizes and validates Korean mobile phone numbers', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(isValidKoreanMobile('010-1234-5678')).toBe(true);
    expect(isValidKoreanMobile('02-123-4567')).toBe(false);
  });

  it('requires privacy consent and required fields', () => {
    expect(validateBookingForm(validForm)).toBeNull();
    expect(validateBookingForm({ ...validForm, privacyConsent: false })).toContain('개인정보');
  });

  it('offers twelve 15-minute starts through 19:45', () => {
    expect(EVENT_TIMES).toHaveLength(12);
    expect(EVENT_TIMES[0]).toBe('17:00');
    expect(EVENT_TIMES.at(-1)).toBe('19:45');
    expect(validateBookingForm({ ...validForm, time: '20:00' })).toContain('예약 시간');
  });
});

describe('concurrency guard decisions', () => {
  it('allows booking only when both slot and representative lock are available', () => {
    expect(canCreateBooking(true, false)).toBe(true);
    expect(canCreateBooking(false, false)).toBe(false);
    expect(canCreateBooking(true, true)).toBe(false);
  });

  it('normalizes management code before deriving lookup access', () => {
    expect(normalizeManagementCode(' k7p9-m2rx-48qd ')).toBe('K7P9M2RX48QD');
  });

  it('normalizes and validates the existing booking number format', () => {
    expect(normalizeBookingCode(' moon-1029-a7k3q ')).toBe('MOON-1029-A7K3Q');
    expect(isValidBookingCode('MOON-1029-A7K3Q')).toBe(true);
    expect(isValidBookingCode('MOON-1028-A7K3Q')).toBe(true);
    expect(isValidBookingCode('MOON-1029-A7K3Q9RX')).toBe(false);
    expect(isValidBookingCode('GUIRO-0929-A7K3Q')).toBe(false);
  });
});
