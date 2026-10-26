# MoonLight 방탈출 예약

2026년 10월 28일 17:00-20:00에 운영하는 MoonLight 방탈출 예약 웹사이트입니다. 15분 간격으로 시작하며 마지막 예약 시작은 19:45입니다. 한 시간에는 한 팀만 예약할 수 있습니다.

## 행사 정책

- 팀당 2-4명
- 1인당 예약금 1,000원, 예약금 전액 기부
- 농협 351-0966-6520-73, 이호열
- 사용자 예약번호 형식: `MOON-1028-XXXXX`

## 데이터 분리

기존 Firebase 프로젝트 `guiro-534c6`를 공유하지만 MoonLight 데이터는 모두 `events/moonlight-2026-10-28` 문서의 하위 컬렉션에 저장합니다.

| MoonLight 경로 | 용도 |
| --- | --- |
| `events/moonlight-2026-10-28/slots/{slotId}` | 공개 예약 현황, 개인정보 없음 |
| `events/moonlight-2026-10-28/bookings/{id}` | 예약 상세 |
| `events/moonlight-2026-10-28/bookingLookups/{code}` | 예약번호 조회 |
| `events/moonlight-2026-10-28/representativeLocks/{phoneHash}` | 대표자 중복 예약 방지 |
| `events/moonlight-2026-10-28/settings/reservation` | 접수 상태 |
| `events/moonlight-2026-10-28/auditLogs/{id}` | 관리자 조작 기록 |

기존 귀로 데이터는 루트 `slots`, `bookings` 등의 경로를 그대로 사용합니다. Firebase Authentication의 관리자 계정과 루트 `admins/{uid}` 권한 문서는 공유합니다.

## 설치와 실행

```bash
npm install
cp .env.example .env
npm run dev
npm test
npm run build
```

`.env`에 Firebase Console의 웹 앱 설정값을 입력합니다. `.env`는 Git에 포함되지 않습니다. 웹 설정값을 넣기 전에도 포스터와 행사 안내는 보이지만 예약 접수는 열리지 않습니다.

## Firebase 설정

1. Firebase Console에서 기존 `guiro-534c6` 프로젝트를 엽니다.
2. `프로젝트 설정 > 일반 > 내 앱`의 웹 앱 설정값 6개를 `.env` 또는 GitHub Actions 변수에 입력합니다.
3. `Authentication > Sign-in method`에서 익명 로그인과 이메일/비밀번호 로그인을 활성화합니다.
4. 관리자 계정의 UID가 기존 `admins/{uid}`에 등록되어 있는지 확인합니다.
5. `Firestore Database > 규칙`에서 기존 규칙을 확인한 뒤 아래 병합 규칙을 배포합니다.

`firestore.guiro.rules`는 복제 시점의 귀로 규칙이고 `firestore.moonlight.rules`는 MoonLight 전용 규칙입니다. `npm run rules:merge`는 둘을 합쳐 `firestore.rules`를 생성합니다. **귀로 규칙이 콘솔에서 나중에 변경되었다면 먼저 `firestore.guiro.rules`를 최신 규칙으로 갱신하고 병합해야 합니다.** Firestore는 프로젝트당 한 규칙 세트를 사용하므로 MoonLight 규칙만 따로 배포하면 기존 귀로 서비스가 영향을 받습니다.

```bash
npm run rules:merge
npx firebase-tools login
npx firebase-tools use guiro-534c6
npx firebase-tools deploy --only firestore:rules
```

## 12개 슬롯 초기화

Google Application Default Credentials 또는 서비스 계정 인증이 설정된 PC에서 실행합니다. 서비스 계정 JSON은 저장소나 채팅에 올리지 않습니다.

PowerShell:

```powershell
$env:MOONLIGHT_FIREBASE_PROJECT_ID = 'guiro-534c6'
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccountKey.json'
npm run init:slots
```

스크립트는 MoonLight 경로의 없는 슬롯만 만들고 기존 문서는 수정하지 않습니다. 17:00부터 19:45까지 12개가 생성됩니다.

서비스 계정이 없는 경우 병합 규칙을 배포한 뒤 관리자 화면에 로그인하여 `10월 28일 슬롯 준비` 버튼을 누를 수 있습니다. 이 버튼도 없는 슬롯만 생성합니다.

## GitHub Pages

저장소: `skyhy0228/MoonLight`
예상 URL: `https://skyhy0228.github.io/MoonLight/`

`Settings > Pages > Source`를 `GitHub Actions`로 선택합니다. `Settings > Secrets and variables > Actions > Variables`에 `.env.example`의 `VITE_FIREBASE_*` 6개 웹 설정값을 같은 이름으로 입력합니다. `main`에 push하면 `.github/workflows/pages.yml`이 정적 사이트를 배포합니다.

## 운영 전 확인

- 포스터, 날짜, 12개 슬롯, 2-4명 선택, 전액 기부 문구를 모바일과 PC에서 확인합니다.
- 두 기기에서 같은 슬롯에 동시에 예약하여 한 건만 성공하는지 확인합니다.
- 취소 후 슬롯이 다시 예약 가능해지는지 확인합니다.
- `firestore.rules` 배포 후 귀로 사이트의 기존 예약 조회도 정상인지 확인합니다.
- 일반 사용자에게 MoonLight 예약 상세 목록과 귀로 예약 상세가 내려오지 않는지 확인합니다.
