import { Link, Navigate, useLocation } from 'react-router-dom';
import { ACCOUNT, EVENT_NAME, formatKoreanDate } from '../config/event';
import type { BookingReceipt } from '../types/reservation';
import { bookingStatusLabel, formatCurrency, paymentStatusLabel } from '../utils/format';

export function CompletePage() {
  const location = useLocation();
  const receipt = location.state as BookingReceipt | null;

  if (!receipt?.booking) return <Navigate to="/" replace />;

  const { booking } = receipt;

  return (
    <main className="single-column">
      <section className="receipt-card">
        <p className="eyebrow">예약 신청이 정상적으로 접수되었습니다.</p>
        <h1>예약 신청이 완료되었습니다.</h1>
        <p className="notice-strong">예약번호를 캡처하여 안전하게 보관해주세요.</p>
        <dl className="receipt-list">
          <div>
            <dt>예약번호</dt>
            <dd>{booking.bookingCode}</dd>
          </div>
          <div>
            <dt>행사</dt>
            <dd>{EVENT_NAME}</dd>
          </div>
          <div>
            <dt>예약일</dt>
            <dd>{formatKoreanDate(booking.date)}</dd>
          </div>
          <div>
            <dt>시간</dt>
            <dd>{booking.time}</dd>
          </div>
          <div>
            <dt>대표자명</dt>
            <dd>{booking.representativeName}</dd>
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
            <dt>입금계좌</dt>
            <dd>
              {ACCOUNT.bank} {ACCOUNT.number}
              <br />
              {ACCOUNT.holder}
            </dd>
          </div>
          <div>
            <dt>예약 상태</dt>
            <dd>
              {bookingStatusLabel(booking.bookingStatus)} · {paymentStatusLabel(booking.paymentStatus)}
            </dd>
          </div>
        </dl>
        <p className="notice-text">예약번호만으로 예약을 조회·변경·취소할 수 있으니 다른 사람에게 공유하지 마세요.</p>
        <div className="receipt-warning">
          <strong>아직 입금 확인 전입니다.</strong>
          <p>예약금은 전액 기부됩니다. 위 계좌로 입금하면 운영진이 확인 후 예약을 확정합니다.</p>
        </div>
        <Link className="primary-button" to="/lookup">
          내 예약 조회 / 변경 / 취소
        </Link>
      </section>
    </main>
  );
}
