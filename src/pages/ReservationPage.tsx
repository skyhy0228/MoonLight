import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import heroImage from '../assets/moonlight-poster.png';
import { AccountBox } from '../components/AccountBox';
import { SlotGrid } from '../components/SlotGrid';
import { EVENT_DATES, EVENT_NAME, MAX_TEAM_SIZE, MIN_TEAM_SIZE, ORGANIZERS, PRIVACY_RETENTION_LABEL, formatKoreanDate } from '../config/event';
import { useReservationSettings } from '../hooks/useReservationSettings';
import { useSlots } from '../hooks/useSlots';
import { createBooking } from '../services/bookingService';
import type { BookingFormData, EventDate } from '../types/reservation';
import { calculateDeposit, formatCurrency, formatPhone } from '../utils/format';
import { validateBookingForm } from '../utils/validation';

export function ReservationPage() {
  const navigate = useNavigate();
  const { slotsByDate, error: slotError } = useSlots();
  const settings = useReservationSettings();
  const [form, setForm] = useState<BookingFormData>({
    date: '2026-10-29',
    time: '',
    teamSize: 2,
    representativeName: '',
    phone: '',
    affiliation: '',
    depositorName: '',
    privacyConsent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const expectedDeposit = calculateDeposit(form.teamSize);
  const selectedSlots = slotsByDate[form.date];
  const validationMessage = validateBookingForm(form);

  const summary = useMemo(
    () => [
      ['날짜', formatKoreanDate(form.date)],
      ['시간', form.time || '선택 전'],
      ['대표자', form.representativeName || '입력 전'],
      ['인원', `${form.teamSize}명`],
      ['예약금', formatCurrency(expectedDeposit)],
    ],
    [expectedDeposit, form],
  );

  function update<K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage('');
  }

  async function submitBooking() {
    setMessage('');
    const nextValidationMessage = validateBookingForm(form);
    if (nextValidationMessage) {
      setMessage(nextValidationMessage);
      return;
    }
    setSubmitting(true);
    try {
      const receipt = await createBooking(form);
      navigate('/complete', { state: receipt });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <main className="reservation-page">
      <section className="hero-banner" aria-label="MoonLight 행사 안내 이미지">
        <img className="hero-banner-image" src={heroImage} alt="달빛 아래 캠퍼스를 달리는 MoonLight 방탈출 행사 포스터" />
      </section>

      <div className="main-grid">
        <section className="event-panel">
          <p className="organizers">{ORGANIZERS}</p>
          <h1>{EVENT_NAME}</h1>
          <p className="event-meta">2026.10.29 · 17:00 - 20:00 · 15분 간격 예약제</p>
          <p className="event-meta">팀당 2~4명 · 총 12팀 예약 가능</p>
        </section>

        <section className="reservation-flow" aria-label="예약 신청">
        {settings.status === 'CLOSED' && (
          <div className="alert-banner">
            <AlertTriangle size={18} aria-hidden="true" />
            현재 예약 접수가 마감되었습니다.
          </div>
        )}
        {slotError && <div className="alert-banner">{slotError}</div>}

        <section className="flow-section">
          <h2>STEP 1 날짜 선택</h2>
          <div className="segmented">
            {EVENT_DATES.map((date) => (
              <button
                type="button"
                key={date}
                className={form.date === date ? 'selected' : ''}
                onClick={() => update('date', date as EventDate)}
              >
                {formatKoreanDate(date)}
              </button>
            ))}
          </div>
        </section>

        <SlotGrid
          date={form.date}
          slots={selectedSlots}
          selectedTime={form.time}
          heading="STEP 2 시간 선택"
          onSelect={(time) => update('time', time)}
        />

        <section className="flow-section">
          <h2>STEP 3 팀 인원 선택</h2>
          <div className="team-picker">
            {Array.from({ length: MAX_TEAM_SIZE - MIN_TEAM_SIZE + 1 }, (_, index) => MIN_TEAM_SIZE + index).map((size) => (
              <button
                key={size}
                type="button"
                className={form.teamSize === size ? 'selected' : ''}
                onClick={() => update('teamSize', size)}
              >
                {size}명
              </button>
            ))}
          </div>
        </section>

        <section className="flow-section">
          <h2>STEP 4 대표자 정보 입력</h2>
          <div className="form-grid">
            <label>
              대표자 이름
              <input value={form.representativeName} onChange={(event) => update('representativeName', event.target.value)} autoComplete="name" />
            </label>
            <label>
              대표자 전화번호
              <input
                value={form.phone}
                onChange={(event) => update('phone', formatPhone(event.target.value))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="010-1234-5678"
              />
            </label>
            <label>
              소속 / 학과
              <input value={form.affiliation} onChange={(event) => update('affiliation', event.target.value)} />
            </label>
            <label>
              입금자명
              <input value={form.depositorName} onChange={(event) => update('depositorName', event.target.value)} />
            </label>
          </div>
        </section>

        <section className="flow-section">
          <h2>STEP 5 입금 안내</h2>
          <AccountBox teamSize={form.teamSize} expectedDeposit={expectedDeposit} />
        </section>

        <section className="flow-section privacy-section">
          <h2>STEP 6 개인정보 동의</h2>
          <p>
            수집 항목: 대표자 이름, 전화번호, 소속/학과, 입금자명, 예약정보. 수집 목적: 축제 체험 예약 운영 및 예약자 연락.
            보유 기간: {PRIVACY_RETENTION_LABEL}.
          </p>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.privacyConsent} onChange={(event) => update('privacyConsent', event.target.checked)} />
            개인정보 수집 및 이용에 동의합니다.
          </label>
        </section>

        <section className="flow-section confirmation-box">
          <h2>STEP 7 예약 내용 최종 확인</h2>
          <dl>
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="notice-strong">예약금은 1인당 1,000원이며 전액 기부합니다. 입금 확인 후 예약이 확정됩니다.</p>
          {message && <p className="error-text">{message}</p>}
          <button
            className="primary-button"
            type="button"
            disabled={submitting || settings.status === 'CLOSED'}
            onClick={() => {
              if (validationMessage) {
                setMessage(validationMessage);
                return;
              }
              setConfirming(true);
            }}
          >
            {submitting ? '예약 처리 중...' : '예약 신청'}
          </button>
        </section>
        </section>
      </div>

      {confirming && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-confirm-title">
            <h2 id="booking-confirm-title">MoonLight 예약 내용을 확인해주세요.</h2>
            <dl>
              {summary.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <AccountBox teamSize={form.teamSize} expectedDeposit={expectedDeposit} />
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirming(false)} disabled={submitting}>
                수정하기
              </button>
              <button className="primary-button" type="button" onClick={() => void submitBooking()} disabled={submitting}>
                {submitting ? '예약 처리 중...' : '예약 신청'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
