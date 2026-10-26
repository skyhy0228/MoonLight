import type { EventDate } from '../types/reservation';

export const EVENT_NAME = 'MoonLight';
export const EVENT_ID = 'moonlight-2026-10-28';
export const EVENT_DOCUMENT_PATH = ['events', EVENT_ID] as const;
export const ORGANIZERS = '국립한국교통대학교 방탈출 체험';
export const EVENT_DATES: EventDate[] = ['2026-10-28'];
export const EVENT_TIMES = [
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

export const BREAK_TIMES: readonly string[] = [];

export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 4;
export const DEPOSIT_PER_PERSON = 1000;
export const ACCOUNT = {
  bank: '농협',
  number: '351-0966-6520-73',
  holder: '이호열',
};
export const PRIVACY_RETENTION_LABEL = '행사 운영 종료 후 운영진이 정한 정리 시점까지';

export function slotId(date: EventDate, time: string) {
  return `${date}_${time.replace(':', '-')}`;
}

export function formatKoreanDate(date: EventDate) {
  const [, month, day] = date.split('-');
  return `2026년 ${Number(month)}월 ${Number(day)}일`;
}
