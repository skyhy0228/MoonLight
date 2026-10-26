import { EVENT_DATES, EVENT_TIMES, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../config/event';
import { normalizePhone } from './format';
import type { BookingFormData, EventDate } from '../types/reservation';

export function isEventDate(date: string): date is EventDate {
  return EVENT_DATES.includes(date as EventDate);
}

export function isEventTime(time: string) {
  return (EVENT_TIMES as readonly string[]).includes(time);
}

export function isValidTeamSize(teamSize: number) {
  return Number.isInteger(teamSize) && teamSize >= MIN_TEAM_SIZE && teamSize <= MAX_TEAM_SIZE;
}

export function isValidKoreanMobile(phone: string) {
  return /^010\d{8}$/.test(normalizePhone(phone));
}

export function validateBookingForm(data: BookingFormData) {
  if (!isEventDate(data.date)) return '예약 날짜를 선택해주세요.';
  if (!isEventTime(data.time)) return '예약 시간을 선택해주세요.';
  if (!isValidTeamSize(data.teamSize)) return '팀 인원은 2명부터 4명까지 가능합니다.';
  if (!data.representativeName.trim()) return '대표자 이름을 입력해주세요.';
  if (!isValidKoreanMobile(data.phone)) return '전화번호는 010-1234-5678 형식의 휴대전화 번호로 입력해주세요.';
  if (!data.depositorName.trim()) return '입금자명을 입력해주세요.';
  if (!data.privacyConsent) return '개인정보 수집 및 이용에 동의해야 예약할 수 있습니다.';
  return null;
}
