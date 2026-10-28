import { CalendarPlus, Download, Lock, LogOut, Search, Unlock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { EVENT_DATES, EVENT_TIMES, formatKoreanDate } from '../config/event';
import { useAuthUser } from '../hooks/useAuthUser';
import { useReservationSettings } from '../hooks/useReservationSettings';
import { useSlots } from '../hooks/useSlots';
import {
  adminCancelBooking,
  adminMoveBooking,
  confirmPayment,
  initializeMoonlightSlots,
  isCurrentUserAdmin,
  loginAdmin,
  logoutAdmin,
  requestAdminPasswordReset,
  setReservationStatus,
  setSlotBlocked,
  undoPaymentConfirmation,
  watchAllBookings,
} from '../services/adminService';
import type { Booking, BookingStatus, EventDate, PaymentStatus, Slot } from '../types/reservation';
import { downloadBookingsCsv } from '../utils/csv';
import { calculateDeposit, formatCurrency, paymentStatusLabel } from '../utils/format';

type SortKey = 'time' | 'createdAt' | 'representativeName';

export function AdminPage() {
  const { user, ready } = useAuthUser();
  const settings = useReservationSettings();
  const { slots } = useSlots();
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | EventDate>('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | BookingStatus>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [editing, setEditing] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState<EventDate>('2026-10-29');
  const [editTime, setEditTime] = useState('17:00');
  const [editTeamSize, setEditTeamSize] = useState(2);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  useEffect(() => {
    let active = true;

    if (!ready || !user) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }

    void isCurrentUserAdmin(user)
      .then((result) => {
        if (active) setIsAdmin(result);
      })
      .catch((error) => {
        if (active) {
          setIsAdmin(false);
          setMessage((error as Error).message);
        }
      });

    return () => {
      active = false;
    };
  }, [ready, user?.uid]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return watchAllBookings(setBookings, setMessage);
  }, [isAdmin]);

  const visibleBookings = useMemo(() => {
    const normalizedSearch = search.replace(/\D/g, '').toLowerCase();
    const textSearch = search.toLowerCase();
    return bookings
      .filter((booking) => {
        const matchesSearch =
          !search ||
          booking.representativeName.toLowerCase().includes(textSearch) ||
          booking.bookingCode.toLowerCase().includes(textSearch) ||
          booking.depositorName.toLowerCase().includes(textSearch) ||
          booking.phone.replace(/\D/g, '').includes(normalizedSearch);
        return (
          matchesSearch &&
          (dateFilter === 'all' || booking.date === dateFilter) &&
          (timeFilter === 'all' || booking.time === timeFilter) &&
          (bookingStatusFilter === 'all' || booking.bookingStatus === bookingStatusFilter) &&
          (paymentStatusFilter === 'all' || booking.paymentStatus === paymentStatusFilter)
        );
      })
      .sort((a, b) => {
        if (sortKey === 'representativeName') return a.representativeName.localeCompare(b.representativeName, 'ko-KR');
        if (sortKey === 'createdAt') return Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0);
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      });
  }, [bookings, bookingStatusFilter, dateFilter, paymentStatusFilter, search, sortKey, timeFilter]);

  const stats = useMemo(() => {
    const activeBookings = bookings.filter((booking) => booking.bookingStatus !== 'cancelled');
    const confirmed = activeBookings.filter((booking) => booking.paymentStatus === 'confirmed');
    return {
      totalReserved: activeBookings.length,
      eventDay: activeBookings.filter((booking) => booking.date === '2026-10-29').length,
      people: activeBookings.reduce((sum, booking) => sum + booking.teamSize, 0),
      expectedDeposit: activeBookings.reduce((sum, booking) => sum + booking.expectedDeposit, 0),
      confirmedDeposit: confirmed.reduce((sum, booking) => sum + booking.expectedDeposit, 0),
      unverifiedDeposit: activeBookings
        .filter((booking) => booking.paymentStatus !== 'confirmed')
        .reduce((sum, booking) => sum + booking.expectedDeposit, 0),
      submitted: activeBookings.filter((booking) => booking.bookingStatus === 'submitted').length,
      confirmed: activeBookings.filter((booking) => booking.bookingStatus === 'confirmed').length,
      cancelled: bookings.filter((booking) => booking.bookingStatus === 'cancelled').length,
    };
  }, [bookings]);

  async function login() {
    setBusy(true);
    setMessage('');
    try {
      await loginAdmin(email, password);
      setIsAdmin(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    setMessage('');
    try {
      await requestAdminPasswordReset(email);
      setMessage('비밀번호 재설정 메일을 보냈습니다. 메일함과 스팸함을 확인해주세요.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAdminAction(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(booking: Booking) {
    setEditing(booking);
    setEditDate(booking.date);
    setEditTime(booking.time);
    setEditTeamSize(booking.teamSize);
  }

  if (!isAdmin) {
    return (
      <main className="single-column">
        <section className="lookup-panel">
          <p className="eyebrow">관리자 로그인</p>
          <h1>Firebase 관리자 계정으로 로그인해주세요.</h1>
          <form
            className="admin-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              void login();
            }}
          >
            <div className="form-grid">
            <label>
              이메일
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
            </label>
            <label>
              비밀번호
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </label>
            </div>
            <div className="admin-login-actions">
              <button className="primary-button" type="submit" disabled={busy || !ready}>
                {busy ? '처리 중...' : '로그인'}
              </button>
              <button className="secondary-button" type="button" onClick={() => void resetPassword()} disabled={busy || !ready || !email.trim()}>
                비밀번호 재설정 메일
              </button>
            </div>
          </form>
          {message && <p className={message.includes('보냈습니다') ? 'success-text' : 'error-text'}>{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <section className="admin-header">
        <div>
          <p className="eyebrow">관리자 대시보드</p>
          <h1>MoonLight 예약 운영</h1>
          <p>현재 접수 상태: {settings.status === 'OPEN' ? '예약 접수 중' : '예약 마감'}</p>
        </div>
        <div className="admin-actions">
          <button className="secondary-button" type="button" onClick={() => void setReservationStatus(settings.status === 'OPEN' ? 'CLOSED' : 'OPEN')}>
            {settings.status === 'OPEN' ? <Lock size={18} aria-hidden="true" /> : <Unlock size={18} aria-hidden="true" />}
            {settings.status === 'OPEN' ? '예약 마감' : '예약 열기'}
          </button>
          <button className="secondary-button" type="button" onClick={() => downloadBookingsCsv(visibleBookings)}>
            <Download size={18} aria-hidden="true" />
            CSV 다운로드
          </button>
          <button className="secondary-button" type="button" onClick={() => void logoutAdmin()}>
            <LogOut size={18} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </section>

      {message && <p className={message.includes('완료') ? 'success-text' : 'error-text'}>{message}</p>}

      <section className="stats-grid" aria-label="예약 현황 요약">
        <Stat label="전체 예약" value={`${stats.totalReserved} / ${slots.length}`} />
        <Stat label="10월 29일" value={`${stats.eventDay} / ${slots.length}`} />
        <Stat label="총 예약 인원" value={`${stats.people}명`} />
        <Stat label="예상 예약금 합계" value={formatCurrency(stats.expectedDeposit)} />
        <Stat label="입금 확인 완료 금액" value={formatCurrency(stats.confirmedDeposit)} />
        <Stat label="입금 확인 전 금액" value={formatCurrency(stats.unverifiedDeposit)} />
        <Stat label="예약 접수 / 확정 / 취소" value={`${stats.submitted} / ${stats.confirmed} / ${stats.cancelled}`} />
      </section>

      <section className="lookup-panel">
        <h2>운영 슬롯 차단</h2>
        {slots.filter((slot) => slot.clientStatusLabel == null).length < EVENT_TIMES.length && (
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void runAdminAction(async () => {
            await initializeMoonlightSlots();
          }, '슬롯 준비가 완료되었습니다.')}>
            <CalendarPlus size={18} aria-hidden="true" />
            10월 29일 슬롯 준비
          </button>
        )}
        <div className="admin-slot-grid">
          {slots.map((slot) => (
            <SlotAdminButton key={slot.id} slot={slot} disabled={busy} onMessage={setMessage} />
          ))}
        </div>
      </section>

      <section className="lookup-panel">
        <h2>예약 목록</h2>
        <div className="admin-filters">
          <label className="search-label">
            <Search size={18} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="대표자, 전화번호, 예약번호, 입금자명" />
          </label>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as 'all' | EventDate)}>
            <option value="all">전체 날짜</option>
            {EVENT_DATES.map((date) => (
              <option key={date} value={date}>
                {formatKoreanDate(date)}
              </option>
            ))}
          </select>
          <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}>
            <option value="all">전체 시간</option>
            {EVENT_TIMES.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
          <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value as 'all' | BookingStatus)}>
            <option value="all">전체 예약상태</option>
            <option value="submitted">예약 접수</option>
            <option value="confirmed">예약 확정</option>
            <option value="cancelled">예약 취소</option>
          </select>
          <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value as 'all' | PaymentStatus)}>
            <option value="all">전체 입금상태</option>
            <option value="unverified">입금 확인 전</option>
            <option value="confirmed">입금 확인 완료</option>
            <option value="needs_review">변경사항 확인 필요</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="time">예약시간순</option>
            <option value="createdAt">생성시간순</option>
            <option value="representativeName">대표자명순</option>
          </select>
        </div>

        <div className="booking-table">
          <div className="booking-row header">
            <span>예약</span>
            <span>대표자</span>
            <span>입금</span>
            <span>상태</span>
            <span>관리</span>
          </div>
          {visibleBookings.map((booking) => (
            <div className="booking-row" key={booking.accessKey}>
              <span>
                <strong>{booking.bookingCode}</strong>
                <small>
                  {booking.date} {booking.time}
                </small>
              </span>
              <span>
                {booking.representativeName}
                <small>
                  {booking.phone} · {booking.affiliation || '소속 없음'} · {booking.teamSize}명
                </small>
                <small>입금자명 {booking.depositorName}</small>
              </span>
              <span>
                {formatCurrency(booking.expectedDeposit)}
                <small>{paymentStatusLabel(booking.paymentStatus)}</small>
              </span>
              <span>
                <StatusBadge status={booking.bookingStatus} />
                <StatusBadge status={booking.paymentStatus} />
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || booking.bookingStatus === 'cancelled'}
                  onClick={() => void runAdminAction(() => confirmPayment(booking), '입금 확인이 완료되었습니다.')}
                >
                  입금 확인
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || booking.bookingStatus === 'cancelled'}
                  onClick={() => void runAdminAction(() => undoPaymentConfirmation(booking), '입금 확인을 취소했습니다.')}
                >
                  확인 취소
                </button>
                <button type="button" className="secondary-button" disabled={busy || booking.bookingStatus === 'cancelled'} onClick={() => beginEdit(booking)}>
                  수정
                </button>
                <button type="button" className="danger-button" disabled={busy || booking.bookingStatus === 'cancelled'} onClick={() => setCancelTarget(booking)}>
                  취소
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="admin-edit-title">
            <h2 id="admin-edit-title">예약 수정</h2>
            <div className="form-grid">
              <label>
                날짜
                <select value={editDate} onChange={(event) => setEditDate(event.target.value as EventDate)}>
                  {EVENT_DATES.map((date) => (
                    <option key={date} value={date}>
                      {formatKoreanDate(date)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시간
                <select value={editTime} onChange={(event) => setEditTime(event.target.value)}>
                  {EVENT_TIMES.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                인원
                <select value={editTeamSize} onChange={(event) => setEditTeamSize(Number(event.target.value))}>
                  {[2, 3, 4].map((size) => (
                    <option key={size} value={size}>
                      {size}명
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>변경 후 예약금: {formatCurrency(calculateDeposit(editTeamSize))}</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setEditing(null)} disabled={busy}>
                닫기
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAdminAction(async () => {
                    await adminMoveBooking(editing, editDate, editTime, editTeamSize);
                    setEditing(null);
                  }, '예약 수정이 완료되었습니다.')
                }
              >
                {busy ? '처리 중...' : '저장'}
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="예약을 취소하시겠습니까?"
        description="예약 문서는 삭제하지 않고 취소 상태로 보관하며, 해당 시간은 다시 예약 가능해집니다."
        confirmLabel="예약 취소"
        busy={busy}
        onClose={() => setCancelTarget(null)}
        onConfirm={() =>
          void runAdminAction(async () => {
            if (cancelTarget) await adminCancelBooking(cancelTarget);
            setCancelTarget(null);
          }, '예약 취소가 완료되었습니다.')
        }
      />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SlotAdminButton({ slot, disabled, onMessage }: { slot: Slot; disabled: boolean; onMessage: (message: string) => void }) {
  async function toggle() {
    const reason = slot.status === 'blocked' ? '' : window.prompt('차단 사유를 입력해주세요.', '운영상 차단') || '운영상 차단';
    try {
      await setSlotBlocked(slot, slot.status !== 'blocked', reason);
      onMessage(slot.status === 'blocked' ? '슬롯 차단을 해제했습니다.' : '슬롯을 차단했습니다.');
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  return (
    <button className={`slot-admin ${slot.status}`} type="button" disabled={disabled || slot.status === 'reserved'} onClick={() => void toggle()}>
      <strong>
        {slot.date.slice(5)} {slot.time}
      </strong>
      <span>{slot.status === 'blocked' ? '운영진 차단' : slot.status === 'reserved' ? '예약 완료' : '예약 가능'}</span>
    </button>
  );
}
