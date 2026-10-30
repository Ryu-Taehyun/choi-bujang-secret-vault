# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 학습에 사용하는 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 최신 저장점: 「4단계 저장점」 — 2026-10-30 (한국 시간)

실제 구현 단계 `aleph.config.json.step`은 **4**입니다. 이번 저장점에는 API 소유자 검사가 포함됩니다. DB의 RLS·최소 권한 SQL은 제안만 했으며 적용 여부와 실제 계정 시험은 미확인입니다. 따라서 4단계 전체 보호가 검증됐다는 뜻은 아닙니다. 아래 1·2단계 설명과 배포 결과는 이전 기록입니다.

- 공식 Supabase SDK 이메일·비밀번호 로그인과 로그아웃 화면, 오류 표시를 구현했습니다. 브라우저는 SDK의 토큰을 자료 API에 보냅니다. `src/verify-login.mjs`는 변경하지 않고 API에서 사용합니다. 토큰이 없거나 검증에 실패하면 DB 자료를 반환하지 않습니다.
- `GET /api/notes`는 검증된 사용자 ID의 메모 배열을 반환합니다. `POST /api/notes`는 `{id?,title,body}`를 받고 검증된 ID를 `owner_id`로 저장하며 `{id}`를 반환합니다. 생략한 메모 ID는 서버가 UUID로 생성합니다.
- `GET`, `PUT`, `DELETE /api/notes/:id`를 구현했습니다. 한 건 응답은 `{id,title,body}`이며 삭제 후 GET은 404입니다. 외부의 `body`는 기존 DB `content` 컬럼에 연결합니다. 이 경로들은 `allowedRoutes`와 Vercel 경로 설정에 기록했습니다.
- 목록과 한 건 조회·수정·삭제는 DB 요청 자체에 검증된 사용자 ID의 `owner_id` 조건을 적용합니다. 타인 또는 소유자 없는 메모는 404입니다. 추가·수정 후 소유자는 서버가 검증된 ID로 고정하고 응답 행의 소유자도 확인합니다. 수정 본문의 `owner_id`는 403으로 거부합니다. 기존 `sample_note_1`~`sample_note_4`의 한 건 작업도 지원하며 새 메모 ID는 UUID입니다.
- 로컬 빌드와 가상 검증 결과·가상 DB를 이용한 API 시험 3건이 통과했습니다. 가상 A/B의 자기 메모 CRUD, 상대 메모 접근 거부, 소유자 변경 거부, URL 소유자 위조, 소유자 없는 행 차단을 확인했습니다. 실제 A/B 로그인·DB CRUD와 소유자 SQL·RLS SQL 적용 후 시험은 미실행입니다. 기존 `test:r5`와 `test:package` 각 1건 실패는 수정 전 커밋에서도 재현됐습니다.
- 소유자 연결 SQL과 RLS·최소 권한 SQL은 채팅에서 검토용으로 제안했습니다. 이 도구가 DB에 적용하지 않았고 실제 권한 조회 결과도 받지 않았습니다. anon 권한 없음, authenticated의 네 CRUD 권한, 기존·새 행의 `auth.uid() = owner_id` 정책은 SQL 적용 후 별도로 확인해야 합니다. 서버 전용 키의 DB 요청은 RLS를 우회할 수 있으므로 API 소유자 검사도 유지해야 합니다.

### 연결 설정과 다시 실행

Supabase 연결 화면에서 Project URL `https://lgpldyanjdhloxlslvrn.supabase.co`를 확인했습니다. `identityProvider.issuer`는 이 주소의 `/auth/v1`, `jwksUrl`은 `/auth/v1/.well-known/jwks.json`, `audience`는 `authenticated`로 기록했습니다. 2026-10-30에 공개키 주소의 HTTP 200과 키 1개를 확인했습니다. 이는 실제 A 로그인 성공을 의미하지 않습니다.

브라우저의 `public/index.html`에는 사용자가 제공한 공개 Project URL과 publishable key를 연결했습니다. 비밀번호와 JWT 처리는 공식 SDK에 맡깁니다. 실제 A 계정 로그인 시험은 미실행입니다. 서버의 `SUPABASE_URL`은 위와 같은 프로젝트여야 합니다. `SUPABASE_SECRET_KEY`는 Vercel 공식 환경변수 입력란에서만 설정하며 코드·채팅에 넣지 않습니다. DB 적재와 실제 권한 상태는 별도 확인이 필요합니다.

2026-10-30에 공개 키로 Auth 설정 HTTP 200과 이메일 로그인 활성화를 확인했고, 브라우저 SDK 주소도 HTTP 200으로 응답했습니다. 이 읽기 점검은 실제 계정 로그인이나 메모 조회·수정 시험을 대신하지 않습니다.

등록된 배포 주소는 `https://choi-bujang-secret-vault-flax.vercel.app/`입니다. 이전 커밋 `58f4ff5`의 단계 3 배포와 nosniff 헤더, 무로그인 401 JSON 응답을 확인했습니다. 서버 설정 후 잘못된 토큰도 401 `INVALID_LOGIN`으로 응답했습니다. 이번 단계 4 소유자 검사 변경은 아직 푸시·배포하지 않았으며 최신 저장점의 배포 확인을 대신하지 않습니다. `judgeIssuer`와 로그인 발급자, 다섯 허용 경로는 보존했습니다. `originalApiUrl`과 `restoreRoute`는 미설정이며, 판정기의 `starter.deny`는 기존 기본 거부 규칙 하나뿐입니다.

재실행: `npm run build -- --local`. API 회귀 시험: `node --experimental-test-module-mocks --test test/notes-auth.test.mjs` (Node.js 22.3 이상 필요). 실제 화면은 연결 설정 후 새 커밋을 배포하고 **A/B 각각 로그인 → 메모 추가 → 수정 → 삭제 → 로그아웃** 순서로 확인합니다. 자기 메모 CRUD는 성공, 상대 메모 한 건 요청과 삭제 후 조회는 404, 수정 본문 소유자 변경은 403, 무로그인은 401이어야 합니다. 로컬 정적 빌드는 API 서버나 실제 계정 시험을 대신하지 않습니다.

제출 묶음은 커밋 후 `npm run bundle`로 생성합니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다. 자기 점검에는 실제 HTTP 결과만 기록하며, 실제 계정 시험 미실행이나 이전 배포를 보호 성공으로 기록하지 않습니다. 발급자 설정 미완료 등 검증 오류가 있으면 제출 JSON은 생성되지 않습니다.

## 1단계 기록: 학생이 하는 일

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계에서는 `/`과 `/data.json`에 가상 메모가 공개됐습니다. 2단계에서는 정적 메모 파일을 제거하고 서버 함수를 통해 조회합니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`과 `api/`의 Vercel 서버 함수를 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. `src/attack-check.mjs`는 2~4단계의 실제 HTTP 응답을 점검합니다. 4단계에서는 비로그인·잘못된 토큰 거부와 배포 정보를 확인하며, 실제 A/B 소유자 시험은 자동으로 실행하지 않습니다. 결과는 학생 자기 점검이며 심판 판정이 아닙니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계 빌드는 `public/data.json`을 생성하지 않고 남은 파일도 제거합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 이전 2단계 기록 — 자료를 코드 밖으로 옮깁니다


### 이번 단계에서 관찰하는 문제

화면만 가리는 것으로는 자료를 보호할 수 없습니다. 1단계처럼 `data.json`과 공개 저장소에 메모가 남아 있으면 화면을 거치지 않고도 자료를 읽을 수 있습니다. 그래서 메모를 서버 자료로 옮기고, 현재 정적 파일과 GitHub 최신 파일에서는 본문을 제거했습니다.

다음으로 관찰할 약점은 **아직 누구나 서버 API를 호출할 수 있다는 점**입니다. `/api/notes`에는 인증이 없으므로 DB와 서버 설정이 준비되면 비로그인 요청으로도 메모를 읽을 수 있습니다. 마지막 실제 확인은 HTTP 503(설정 미완료)이어서 네 건 조회는 미확인입니다. 서버로 옮겼다는 사실만으로 접근 제어나 과거 노출이 해결됐다고 판단하지 않습니다.


- 이전 변경(491e71b): 코드와 정적 JSON에서 메모 본문을 제거했습니다.
- 현재 화면은 `/api/notes`를 호출합니다. 서버는 Supabase `public.training_notes`에서 네 학습 메모 ID만 조회하고 제목·본문만 반환합니다. 코드에 예시 메모를 다시 넣는 대체 동작은 없습니다.
- `aleph.config.json`의 `step`은 2입니다. 빌드와 배포 식별 정보 생성은 이후 단계도 허용하며, `/aleph.json`의 단계는 설정값을 따릅니다.
- `/data.json`은 정적 배포에서 제거됩니다. 빌드는 데이터베이스를 읽지 않으므로 메모와 서버 키가 정적 파일에 들어가지 않습니다.

### 실행 준비와 확인

1. 이전에 전달한 SQL 파일을 Supabase **SQL Editor → Run**에서 실행합니다. `training_notes`의 메모 수 4, `owner_id uuid`, RLS 활성화, `anon`·`authenticated` 읽기 권한 없음 상태를 확인합니다. SQL과 메모 본문은 Git에 올리지 않습니다.
2. Vercel **Project → Settings → Environment Variables**에서 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 서버 환경변수로 직접 입력합니다. 키 값은 채팅·코드·로그에 넣지 말고 브라우저용 접두사를 붙이지 않습니다. 배포 환경에 적용하고 **Deployments → Redeploy**합니다.
3. 로컬 정적 빌드 확인 명령: `npm run build -- --local`. Vercel 배포에서는 `npm run build`가 시스템 환경변수로 `public/aleph.json`도 만듭니다. `npm run bundle`은 요구하지 않습니다.
4. 정상 결과: 화면에 네 카드, `/api/notes`에 제목·본문 네 건, `/aleph.json`에 현재 저장소·커밋·단계 2가 표시됩니다. `/data.json`에는 메모가 없어야 합니다(일반적으로 404). API의 POST 등 GET 이외 요청은 405로 거부합니다.
5. 환경변수가 없으면 API는 503, DB 조회 실패는 502와 고정 오류 코드만 반환합니다. 응답이나 로그에 키·DB 오류 원문을 출력하지 않습니다. 공개 키로 DB에 직접 읽기를 시도하는 점검은 심판이 확인합니다.

### 아직 남은 약점

`/api/notes`는 **인증 없는 공개 주소**입니다. 주소를 아는 누구나 서버 함수를 통해 가상 메모를 읽을 수 있습니다. DB의 RLS와 클라이언트 읽기 권한 제한은 이 공개 서버 함수의 접근을 막지 않습니다. 이번 단계는 저장 위치를 분리한 것이며 로그인·소유자별 접근 제어는 아직 구현하지 않았습니다. 실제 학생 자료는 넣지 않습니다.

SQL 실행과 Vercel 환경변수 설정 여부는 코드만으로 보장되지 않습니다. 네 카드가 실제 배포에서 보이는지는 배포 후 별도로 확인해야 합니다.

## 2단계 검색 확인 절차와 기록

### 검색 범위와 실행 방법

검색 기준은 SQL로 옮긴 가상 메모 본문 네 문장 각각의 **완전한 문자열**입니다. 제목이나 `SAMPLE_NOTE_1`만 검색해서 본문 제거를 판정하지 않습니다. 검색어 파일·SQL·내려받은 API 응답은 저장소 및 `public/` 밖에 둡니다. README나 시험 코드에 본문을 다시 적지 않습니다.

기존 작업 폴더는 건드리지 않고 임시 폴더에 최신 저장소를 새로 받아 확인할 수 있습니다. 아래 명령은 PowerShell 7과 Git, Node.js, npm, ripgrep(`rg`)이 있는 환경에서 실행합니다. 네 번의 입력에는 **가상 메모 본문만** 입력하며 키·토큰·실제 학생 자료는 넣지 않습니다.

```powershell
$auditRoot = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $auditRoot | Out-Null
git clone --branch main --single-branch https://github.com/Ryu-Taehyun/choi-bujang-secret-vault.git "$auditRoot/repo"
$patterns = 1..4 | ForEach-Object { Read-Host "가상 메모 본문 $_" }
if (@($patterns | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count) { throw '빈 검색어는 사용할 수 없습니다.' }
$patterns | Set-Content -Encoding utf8 "$auditRoot/phrases.txt"
Set-Location "$auditRoot/repo"
git rev-parse HEAD
rg -l --hidden -F -f "$auditRoot/phrases.txt" -g '!.git/**' -g '!node_modules/**' .
npm run build -- --local
rg -l --hidden -F -f "$auditRoot/phrases.txt" public
```

각 `rg` 직후 종료 코드를 확인합니다. **0은 본문이 발견됨**, **1은 일치 없음**, **2 이상은 검색 오류**입니다. 오류를 일치 없음으로 기록하지 않습니다. 파일 이름만 출력하며 메모 문장은 결과 기록에 복사하지 않습니다. 로컬 빌드는 실제 배포 확인을 대신하지 않습니다.

실제 배포 파일은 다음과 같이 **쿠키·인증 헤더 없이** 받아 별도로 검색합니다.

```powershell
$base = 'https://choi-bujang-secret-vault-flax.vercel.app'
foreach ($entry in @(@('/', 'index.html'), @('/data.json', 'data.json'), @('/aleph.json', 'aleph.json'))) {
  $result = Invoke-WebRequest -Uri ($base + $entry[0]) -SkipHttpErrorCheck -Headers @{ 'Cache-Control' = 'no-cache' }
  $result.Content | Set-Content -Encoding utf8 (Join-Path $auditRoot $entry[1])
  [pscustomobject]@{ Path = $entry[0]; Status = [int]$result.StatusCode }
}
rg -l -F -f "$auditRoot/phrases.txt" "$auditRoot/index.html" "$auditRoot/data.json" "$auditRoot/aleph.json"
```

`/`와 `/aleph.json`은 200인지, `/data.json`은 404이고 메모가 없는지 확인합니다. 오류 페이지·접속 실패를 정상 정적 파일로 판정하지 않습니다. `/aleph.json`의 저장소·커밋을 기록한 GitHub SHA와 대조합니다. 배포가 뒤처졌다면 최신 코드 검증과 구분해 기록합니다. 현재 화면은 CSS와 스크립트가 HTML 안에 있습니다. 이후 별도 JS·JSON 등 브라우저가 받는 파일이 생기면 그 파일도 내려받아 같은 검색에 포함합니다.

`/api/notes` 응답은 정적 파일과 **별도 항목**으로 확인합니다. 비로그인 HTTP 상태, 메모 건수, 네 본문과의 일치 여부만 기록하고 키·본문·DB 오류 원문은 기록하지 않습니다. 화면 카드 네 개가 표시되는지도 확인합니다. 실패·미실행은 그대로 기록하며 인증 차단 성공으로 바꾸어 쓰지 않습니다. 공개 키로 Supabase를 직접 요청하는 점검은 심판이 확인합니다. 이 절차는 `npm run bundle`을 요구하지 않습니다.

### 실제 검색 결과 — 2026-10-28 (한국 시간)

확인한 코드와 배포 커밋: `91e6c99db0dec0f7e449b2e1c1b2d4018ddb79f9`. 아래 결과는 이 README 기록을 추가하기 직전의 스냅샷이며, 이후 배포에도 자동 적용되는 판정은 아닙니다.

| 구분 | 실제 확인 결과 |
| --- | --- |
| GitHub 최신 커밋의 추적 파일 전체 | 43개 파일을 네 본문으로 검색: 일치 파일 0개, 읽기 실패 0개 |
| 현재 배포 `/` | HTTP 200, 네 본문 일치 0건 |
| 현재 배포 `/data.json` | HTTP 404, 메모 본문 없음 |
| 현재 배포 `/aleph.json` | HTTP 200, 네 본문 일치 0건, step 2 및 위 커밋 일치 |
| 공개 API `/api/notes` | 비로그인 HTTP 503, `NOTES_NOT_CONFIGURED`; 네 건 조회 및 실제 화면 네 카드 확인은 미완료 |

### 공개 API의 남은 약점과 과거 노출

검색 결과 0건은 **현재 확인한 코드·정적 응답에서 본문을 찾지 못했다는 뜻**입니다. `/api/notes`에는 사용자 인증·소유자별 접근 제어가 없습니다. 서버 환경변수와 DB 준비가 끝나면 누구나 이 공개 주소로 가상 메모를 읽을 수 있습니다. 현재 503은 설정 미완료이며 접근 제어 성공이 아닙니다. 화면에 네 카드가 보이는 상태에서도 API 본문 노출은 별도로 남습니다.

옛 공개 커밋의 메모 본문, 옛 Vercel 배포, 이미 내려받은 복사본은 이번 변경으로 없어지지 않습니다. 과거 커밋·배포의 회수나 접근 차단은 이번에 수행하거나 검증하지 않았습니다. **옛 공개 커밋과 옛 배포가 남는 한 과거 노출이 해소됐다고 쓰지 않습니다.** 현재 정적 파일 검색 통과를 과거 노출 해소나 자료실 전체 보호 완료로 보고하지 않습니다.

## 2단계 저장점 — 2026-10-28

화면은 서버의 `/api/notes`로 DB 조회를 요청하며 정적 메모 파일은 배포에서 제거했습니다. 마지막 확인에서 `/`·`/aleph.json`은 200, `/data.json`은 404, `/api/notes`는 503(설정 미완료)이었습니다. 실제 네 카드 및 DB 적재·권한 검증은 미완료입니다. API 인증 부재와 옛 커밋·배포의 과거 노출 한계는 그대로 남습니다.

설정의 단계는 2, 실제 저장소·배포 주소를 기록했습니다. 로그인 발급자와 원본 API 주소는 아직 없고 허용 경로 정책도 구현 전입니다. 판정기의 `starter.deny`는 실제 기본 거부 규칙이며 추가 보호 규칙이 아닙니다. `judgeIssuer`는 변경하지 않았습니다.

재실행: `npm run build -- --local`로 정적 빌드를 확인합니다. Vercel 환경변수를 공식 설정 화면에서 입력한 뒤 Redeploy하고 화면을 확인합니다. 이번처럼 별도로 제출 묶음을 요청한 경우에는 커밋 후 `npm run bundle`을 실행합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 올리지 않습니다. 실제 요청 결과만 묶음에 남기며 실패를 성공으로 바꾸지 않습니다.
