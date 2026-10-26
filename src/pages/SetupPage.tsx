import poster from '../assets/moonlight-poster.png';

export function SetupPage() {
  return (
    <main className="setup-page">
      <img src={poster} alt="MoonLight 방탈출 행사 포스터" />
      <div className="setup-details">
        <p className="eyebrow">2026년 10월 28일</p>
        <h1>MoonLight</h1>
        <p>17:00 - 20:00 · 15분 간격 방탈출 예약</p>
        <p>예약 접수 준비 중입니다.</p>
      </div>
    </main>
  );
}
