import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SlotGrid } from '../components/SlotGrid';
import { StatusBadge } from '../components/StatusBadge';
import { EVENT_DATES, formatKoreanDate } from '../config/event';
import { useSlots } from '../hooks/useSlots';
import { cancelBooking, changeBooking, getBookingByCode } from '../services/bookingService';
import type { Booking, EventDate } from '../types/reservation';
import { bookingStatusLabel, calculateDeposit, formatCurrency, paymentStatusLabel } from '../utils/format';
import { isValidTeamSize } from '../utils/validation';

export function LookupPage() {
  const { slotsByDate } = useSlots();
  const [bookingCode, setBookingCode] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editDate, setEditDate] = useState<EventDate>('2026-10-28');
  const [editTime, setEditTime] = useState('');
  const [editTeamSize, setEditTeamSize] = useState(2);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function lookup() {
    setBusy(true);
    setMessage('');
    try {
      const found = await getBookingByCode(bookingCode);
      setBooking(found);
      setEditDate(found.date);
      setEditTime(found.time);
      setEditTeamSize(found.teamSize);
    } catch (error) {
      setBooking(null);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    if (!booking) return;
    if (!editTime) {
      setMessage('변경할 시간을 선택해주세요.');
      return;
    }
    if (!isValidTeamSize(editTeamSize)) {
      setMessage('팀 인원은 2명부터 4명까지 가능합니다.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await changeBooking(booking, editDate, editTime, editTeamSize);
      const refreshed = await getBookingByCode(booking.bookingCode);
      setBooking(refreshed);
      setMessage('예약 변경이 완료되었습니다.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!booking) return;
    setBusy(true);
    setMessage('');
    try {
      await cancelBooking(booking);
      const refreshed = await getBookingByCode(booking.bookingCode);
      setBooking(refreshed);
      setCancelOpen(false);
      setMessage('예약이 취소되었습니다.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="single-column">
      <section className="lookup-panel">
        <p className="eyebrow">내 예약 조회 / 변경 / 취소</p>
        <h1>예약번호를 입력해주세요.</h1>
        <div className="form-grid">
          <label>
            예약번호
            <input value={bookingCode} onChange={(event) => setBookingCode(event.target.value.toUpperCase())} placeholder="MOON-1028-A7K3Q" />
          </label>
        </div>
        <p className="notice-text">예약번호만 있으면 예약을 조회·변경·취소할 수 있으니 다른 사람에게 공유하지 마세요.</p>
        <button className="primary-button" type="button" onClick={() => void lookup()} disabled={busy}>
          {busy ? '조회 중...' : '조회하기'}
        </button>
        {message && <p className={message.includes('완료') || message.includes('취소') ? 'success-text' : 'error-text'}>{message}</p>}
      </section>

      {booking && (
        <section className="lookup-panel">
          <h2>예약 내용</h2>
          <dl className="receipt-list compact">
            <div>
              <dt>대표자명</dt>
              <dd>{booking.representativeName}</dd>
            </div>
            <div>
              <dt>날짜</dt>
              <dd>{formatKoreanDate(booking.date)}</dd>
            </div>
            <div>
              <dt>시간</dt>
              <dd>{booking.time}</dd>
            </div>
            <div>
              <dt>인원</dt>
              <dd>{booking.teamSize}명</dd>
            </div>
            <div>
              <dt>예약금</dt>
              <dd>{formatCurrency(booking.expectedDeposit)}</dd>
            </div>
            <div>
              <dt>예약 상태</dt>
              <dd>
                <StatusBadge status={booking.bookingStatus} /> {bookingStatusLabel(booking.bookingStatus)}
              </dd>
            </div>
            <div>
              <dt>입금 상태</dt>
              <dd>
                <StatusBadge status={booking.paymentStatus} /> {paymentStatusLabel(booking.paymentStatus)}
              </dd>
            </div>
          </dl>

          {booking.bookingStatus !== 'cancelled' && (
            <>
              <section className="flow-section">
                <h2>예약 변경</h2>
                <div className="segmented">
                  {EVENT_DATES.map((date) => (
                    <button key={date} type="button" className={editDate === date ? 'selected' : ''} onClick={() => setEditDate(date)}>
                      {formatKoreanDate(date)}
                    </button>
                  ))}
                </div>
                <SlotGrid date={editDate} slots={slotsByDate[editDate]} selectedTime={editTime} onSelect={setEditTime} />
                <label className="inline-label">
                  팀 인원
                  <select value={editTeamSize} onChange={(event) => setEditTeamSize(Number(event.target.value))}>
                    {[2, 3, 4].map((size) => (
                      <option key={size} value={size}>
                        {size}명 · {formatCurrency(calculateDeposit(size))}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" type="button" onClick={() => void saveChanges()} disabled={busy}>
                  {busy ? '변경 처리 중...' : '예약 변경'}
                </button>
              </section>
              <button className="danger-button" type="button" onClick={() => setCancelOpen(true)}>
                예약 취소
              </button>
            </>
          )}
        </section>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="정말 예약을 취소하시겠습니까?"
        description="취소된 시간대는 즉시 다시 예약 가능 상태로 바뀝니다."
        confirmLabel="예약 취소"
        busy={busy}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void confirmCancel()}
      />
    </main>
  );
}
