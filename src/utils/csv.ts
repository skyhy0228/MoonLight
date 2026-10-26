import type { Booking } from '../types/reservation';
import { bookingStatusLabel, paymentStatusLabel } from './format';

function escapeCsv(value: string | number | undefined) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadBookingsCsv(bookings: Booking[]) {
  const headers = ['예약번호', '날짜', '시간', '대표자', '전화번호', '소속', '팀인원', '입금자명', '예약금', '입금상태', '예약상태'];
  const rows = bookings.map((booking) => [
    booking.bookingCode,
    booking.date,
    booking.time,
    booking.representativeName,
    booking.phone,
    booking.affiliation || '',
    booking.teamSize,
    booking.depositorName,
    booking.expectedDeposit,
    paymentStatusLabel(booking.paymentStatus),
    bookingStatusLabel(booking.bookingStatus),
  ]);
  const csv = [`\uFEFF${headers.map(escapeCsv).join(',')}`, ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'moonlight-reservations.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
