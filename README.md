# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 학습에 사용하는 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 최신 저장점: 「10단계 저장점」 — 2026-11-03 (한국 시간)

시작 시 마지막 커밋 `04a46e9` 「9단계 저장점」, README 최신 기록, 설정 단계 9가 일치했고 작업 폴더는 깨끗했습니다. 현재 설정 단계는 10입니다. 기존 API·판정기·탐지기·화면과 운영 데이터·정책은 변경하지 않았습니다.

### 안전 정책과 검증 범위

복원 버전은 `stage9-safe-v1`입니다. `recovery/safe-policy.json`에 기존 판정기·보조 규칙·탐지기·서버 API 소유자/구역 검사·allowedRoutes·8단계 DB 준비 SQL의 사본과 10단계 DB 목표 SQL을 묶었습니다. SHA-256은 `7fa7cc0eb2682be9acb76f48a0012f19662da12bbf4e79f51e22061920263ecf`이며 `recovery/safe-policy.sha256`과 대조합니다. Git의 검토된 저장점에서 이 두 파일을 함께 신뢰하며, 침공된 시험 파일로 기준 사본이나 해시를 다시 만들지 않습니다. `.gitattributes`는 사본의 바이트를 줄바꿈 변환 없이 보존합니다.

**실제 DB의 정책 덤프·권한 조회·B 계정 메모 원본은 제공되지 않았습니다.** 따라서 `dbAccess.ownerOnly`는 독립 로컬 시험 저장소의 소유자 정책이며 `liveDbVerified:false`입니다. [DB 목표 SQL](docs/STAGE10_SAFE_DB.sql)은 이전 README의 소유자 정책을 구체화한 제안이고 운영 DB에서 읽은 정책 사본이 아닙니다. 실제 DB 정책 복원은 원본 확보·검토 전까지 중단 상태입니다. PostgreSQL의 기존 permissive 정책은 OR로 합쳐지므로 이 SQL을 추가하는 것만으로 보호가 완성되지 않습니다. 이번 도구는 운영 DB 연결·SQL 실행 기능을 갖지 않습니다.

### 시험 정책 복원: 먼저 계획, 그다음 확인

저장소 폴더에서 처음 한 번 `npm run recovery -- init`으로 `.recovery-private/`에 비공개 B 가상 메모 사본과 시험 정책·자료·감사 상태를 만듭니다. 기존 사본은 덮어쓰지 않습니다. 이 폴더와 `artifacts/`는 Git 및 공개 빌드 대상이 아닙니다. 백업 본문과 trial.json을 출력하거나 제출하지 않습니다. 별도 장치·보호된 위치에 기준 사본·해시·비공개 메모 사본·anchor를 함께 보관해야 하며, 백업과 해시를 모두 바꿀 수 있는 공격자에 대한 서명/외부 인증 기능은 아닙니다.

1. `npm run recovery -- invade`: 시험 사본의 `dbAccess.ownerOnly` 한 규칙만 true에서 false로 바꾸고 감사 사건을 추가합니다. 운영 파일과 다른 서비스 규칙은 보존합니다.
2. `npm run recovery -- plan`: 안전 버전·기준 해시·시험 상태 해시·차이만 표시합니다. 이번 차이는 `/dbAccess/ownerOnly: false → true` 한 항목입니다.
3. 표시된 버전과 변경 범위를 확인한 뒤 `npm run recovery -- apply '계획에 표시된 confirmation'`을 실행합니다. 확인값 누락·불일치, 계획 이후 변경, 사본 누락·해시 불일치면 변경 없이 중단합니다. 승인한 계획의 상태 전체가 달라지면 새 계획을 확인해야 합니다.
4. `npm run recovery -- plan`에서 차이 0건을 확인합니다. 시험 정책 영역만 복원하고 다른 서비스·메모·기존 감사 사건을 보존하며 복원 감사 사건만 추가합니다. 쓰기 잠금과 파일 교체로 동시에 실행하는 복구의 충돌을 막습니다. 중단으로 writer.lock이 남았다면 실행 중인 복구가 없는지 확인하고 별도 검토해야 하며 자동으로 잠금을 지우지 않습니다.

이번 로컬 실행에서 복원 전 B의 A 자료 접근이 허용되는 침공 상태를 재현했고, 복원 뒤 A 자기 읽기 허용·B의 A 읽기 거부·정책 차이 0건을 확인했습니다. 운영 정책 복원이나 실제 A/B 로그인 증거는 아닙니다.

### B의 한 건만 복구하는 POST 서비스

서비스는 별도 **recovery-lab**, 경로는 **POST http://127.0.0.1:43110/restore/notes/20000000-0000-4000-8000-000000000002**입니다. 복구 대상 ID는 `20000000-0000-4000-8000-000000000002`, 소유자는 로컬 B 가명 `10000000-0000-4000-8000-000000000002`로 고정합니다. 실제 Supabase B 계정 ID라고 주장하지 않습니다. 운영 자료 경로와 판정기의 allowedRoutes에는 이 경로를 추가하지 않았으며 `restoreRoute:null`은 운영 복구 경로 미연결을 뜻합니다.

`npm run recovery -- serve`로 루프백 서버를 시작합니다. 이 서비스는 서버가 정한 B 시험 계정만 사용하며 브라우저 Origin/Sec-Fetch 요청과 클라이언트의 ID·소유자·본문 지정은 거부합니다. 운영용 인증 서비스가 아니며 공용 호스트에 노출하지 않습니다. 별도 PowerShell 창에서 먼저 다음을 실행합니다. 응답은 버전·ID·소유자·내용 해시와 확인 계획뿐입니다.

```powershell
$restoreUrl = 'http://127.0.0.1:43110/restore/notes/20000000-0000-4000-8000-000000000002'
$restorePlan = Invoke-RestMethod -Uri $restoreUrl -Method Post -ContentType 'application/json' -Body '{"preview":true}'
$restorePlan | ConvertTo-Json -Depth 8
```

위 계획의 한 건과 버전을 확인한 **다음에만** 아래 실행으로 복원합니다.

```powershell
Invoke-RestMethod -Uri $restoreUrl -Method Post -ContentType 'application/json' -Body (@{ confirmation = $restorePlan.confirmation } | ConvertTo-Json)
```

비공개 note-backup.json의 해시를 note-anchor.json과 대조하고 ID·B 소유자·`SHA-256(JSON.stringify([title,content]))`를 확인합니다. 다른 ID·다른 계정·기존 행의 다른 소유자·사본 변조·오래된 확인값은 거부합니다. 삭제됐다면 그 ID만 추가하고, 남아 있다면 B의 같은 ID 한 건만 대체합니다. 다른 메모·정책·감사 이력은 유지하며 복원 감사 사건을 추가합니다. 응답에는 메모 본문이 없습니다.

이번 시험 사본에서 삭제 후 실제 로컬 POST 복원 HTTP 200을 확인했습니다. 대상 ID·소유자는 위 값, 내용 해시는 `9f7ddc331db1cac0ffa895f8f8fda7798e9b082a28302f23adb9def43c594ef6`으로 비공개 사본과 일치했습니다. 다른 메모·정책·기존 감사 이력의 해시도 유지됐습니다. `init`을 새 위치에서 실행하면 새 비공개 내용과 해시가 생성되므로 그때의 anchor/계획을 기준으로 확인합니다.

### 복구 뒤 1~9단계 재검사 순서

| 순서 | 재실행·확인 위치 | 정상 / 금지 결과 | 이번 결과 |
| --- | --- | --- | --- |
| 1 | `npm run recovery:test` | 사전 계획·정책 복원·B 한 건 POST 복원 / 누락·변조·다른 계정·확인값 불일치 거부 | 로컬 시험 4개 통과 |
| 2 | `npm run build -- --local` | 정적 빌드 성공, 공개 data.json·메모 사본 없음 | 성공 |
| 3 | `node --experimental-test-module-mocks --test test/notes-auth.test.mjs test/zones-stage8.test.mjs test/decider-stage7.test.mjs test/detect-stage9.test.mjs` | 자기 CRUD 유지 / 무로그인·타인 자료·소유자 변경·다른 반·역할 위조·금지 구역 거부 | 모의 시험 13개 통과 |
| 4 | `npm run decider:test` | 등록 정상·가상 재확인 allow / 미등록 deny·복합 사건 step_up | 가상 4항목 통과 |
| 5 | `npm run detect:test` | 120건 이하·느린 조회·다른 사용자 observe / 같은 sub의 10분 내 121건 이상 propose_revocation | 가상 6항목 통과 |
| 6 | 커밋 뒤 `npm run bundle` | 실제 배포의 화면·정적 파일 제거·무로그인/잘못된 로그인·공지 쓰기 거부·배포 커밋 대조 | 실행 결과는 제출 JSON에 기록하며 로컬 시험과 구분 |
| 7 | 실제 자료실 **로그인 → 자기 메모 열기**, A/B 별도 세션으로 자기 CRUD 후 상대 메모 직접 GET·PUT·DELETE | A/B 정상 유지 / 타인 메모 404·소유자 변경 403·무로그인 401 | 실제 계정·DB 시험 미실행 |
| 8 | 운영 측 원본 API·기기 등록·추가 로그인·검증 사건 전달/접속 회수 재검사 | 원본 우회·미등록·복합 이상을 기존 규칙으로 제한, 정상 재확인 유지 | 운영 연결 시험 미실행 |
| 9 | 실제 DB에서 정책/권한 덤프·RLS·기존 정책 목록·자료/감사 지문 대조 | 검증한 안전 버전만 선택 복원, 다른 서비스·감사 보존 | DB 원본 미제공으로 복원·검증 미실행 |

가상 판정·모의 DB/API·로컬 복구는 실제 운영 복원이나 심판 통과를 뜻하지 않습니다. 기존 Vercel 주소·로그인 발급자·공개키 주소·audience·두 GET 허용 경로·원본 API 주소·judgeIssuer를 대조해 보존했습니다. 단계만 10으로 올렸으며 판정기 RULE_IDS는 실제 기존 4개 그대로입니다. 생성 JSON·bundle-notes.json·비공개 메모 사본은 커밋하지 않습니다.

제출 묶음 첫 실행은 자기 점검의 2~9단계 제한으로 실패했습니다. 첫 오류만 근거로 `src/attack-check.mjs`의 허용 범위를 10까지 확장했습니다. 실제 HTTP 점검은 기존 배포를 대상으로 하며 로컬 복구 결과를 운영 복구 성공으로 기록하지 않습니다.

## 이전 저장점: 「9단계 저장점」 — 2026-11-03 (한국 시간)

시작 시 마지막 커밋 `8b1a036` 「8단계 저장점」과 README·설정 단계 8은 일치했고 Git 작업 폴더는 깨끗했습니다. 현재 설정 단계는 9입니다. 기존 로그인·자기 메모 CRUD·소유자 검사·자원 구역·등록 기기·추가 확인 규칙과 화면을 보존했습니다.

`src/detect.mjs`는 [가상 사건 계약](docs/DETECT_EVENTS.md)의 `at`, `method`, `identity.sub`만 읽습니다. 누락·잘못된 시각 등 잘못된 입력은 원문 없는 고정 오류로 거부합니다. GET 시각만 사용자별로 정렬하고 모든 10분 이동 구간을 검사합니다. 양 끝 차이가 정확히 10분인 사건은 포함하며 10분 밖·다른 사용자·GET 이외 사건은 합산하지 않습니다. 120건 이하는 `{action:"observe"}`, 121건 이상은 정확히 `{action:"propose_revocation",reasonCode:"burst_read",subject:해당 sub}`만 반환합니다. 입력을 변경하거나 사건·본문·토큰을 저장·출력하지 않습니다.

재실행: `npm run detect:test`. 정상 30건·120건·사용자별 100건·느린 200건은 observe, 폭주 121건·200건은 propose_revocation으로 가상 시험 6항목이 통과했습니다. `node --test test/detect-stage9.test.mjs`의 시간 경계·이동 창·입력 접근 제한 등 5개 시험과 `npm run decider:test`의 기존 4항목도 통과했습니다. 판정기 응답 다섯 항목과 RULE_IDS는 변경하지 않았습니다. burst_read는 별도 탐지 규칙입니다.

설정을 구현과 대조해 단계만 9로 갱신했습니다. 기존 Vercel 배포 주소, Supabase 발급자·공개키 주소·audience, GET 메모·공지 단건 허용 경로, 원본 메모 API 주소, judgeIssuer와 미설정 restoreRoute는 보존했습니다. 커밋 후 `npm run bundle`은 등록된 배포에 실제 HTTP 자기 점검을 보내며 생성 JSON과 bundle-notes.json은 커밋하지 않습니다. 묶음 오류는 첫 오류만 근거로 수정합니다.

실제 화면의 기존 확인 위치는 자료실 **로그인 → 자기 메모 열기**입니다. 폭주 탐지·회수용 화면이나 회수 API는 추가하지 않았으며 기기 권한도 바꾸지 않았습니다. 운영 엔진의 검증 사건 전달·회수 제안 집행과 실제 접속 차단·심판 판정은 미연결·미확인입니다. 공지 DB 준비·실제 계정 시험 등 8단계의 미확인 사항도 남습니다. 로컬 탐지 통과는 실제 접속 회수 성공을 뜻하지 않습니다.

제출 묶음 첫 실행은 자기 점검의 2~8단계 제한으로 실패했습니다. 첫 오류만 근거로 `src/attack-check.mjs`의 허용 범위를 9까지 확장했으며 기존 HTTP 점검은 유지했습니다.

## 이전 저장점: 「8단계 저장점」 — 2026-11-02 (한국 시간)

시작 시 마지막 커밋 `53e4109` 「7단계 저장점」, README와 설정의 단계 7이 일치했고 Git 작업 폴더는 깨끗했습니다. 현재 설정 단계는 8입니다. 기존 자료·주소·화면 메뉴와 로그인·자기 메모 CRUD·소유자 검사, 기기 등록·가상 복합 사건 추가 확인 규칙을 보존했습니다.

### 자원 ID와 구역

상세 계약은 [docs/RESOURCE_ZONES.md](docs/RESOURCE_ZONES.md)에 있습니다. 서버가 서비스와 경로에서 `notes:ID`, `announcements:ID`, `instructor-materials:ID`를 구별합니다. 기존 메모 JSON은 유지하고 `X-Resource-Id` 헤더로 자원을 표시합니다. 판정기 계약에 role이나 resourceId 필드는 추가하지 않았습니다.

- 메모: notes 서비스의 `GET /notes/:id`와 실제 단건 경로만 허용 후보입니다. ID 없는 전체 목록은 거부하며 ID를 UUID로 제한하지 않습니다. 주인 비교는 자료 API에서 검증된 사용자와 저장된 owner_id로 수행합니다.
- 반 공지(강사 작성): announcements 서비스의 `GET /announcements/:id`만 허용 후보입니다. 학생 경로의 POST·PUT·PATCH·DELETE는 강사를 포함해 모두 거부합니다.
- 강사 자료: instructor-materials 서비스는 판정기에서 모두 거부하며 직접 자료 API도 자료를 내보내지 않습니다.
- `resource_zone` 규칙은 method·service·route·실제 path를 함께 비교합니다. 알 수 없는 경로·목록·쓰기·쿼리 선택·경로 중첩·이동·예약 기능 이름은 기본 거부합니다. ID와 같은 깊이의 export 기능은 만들지 않았습니다. 이유 코드는 기존 `starter_not_ready`를 재사용합니다. 허용 후보에도 기존 기기·추가 확인 규칙이 적용됩니다.

### API 재검사와 실제 준비 상태

기존 메모 API는 모든 조회·수정·삭제에 검증된 사용자 ID의 owner_id 조건을 유지하고 단건 응답의 ID·소유자를 다시 확인합니다. 타인·소유자 없는 메모는 404입니다. 새 공지 API는 저장된 반 소속을 대조해 같은 반 공지만 반환하며 다른 반은 404, 소속 없음은 403입니다. 화면 메뉴·본문 role·헤더는 권한 근거로 쓰지 않습니다. 오류 사유는 짧은 고정 코드로 반환합니다.

강사의 공지 수정은 **PUT /api/admin/announcements/:id**의 별도 서버 관리 경로입니다. 판정기에서는 이 경로를 허용하지 않습니다. 서버의 저장된 instructor 권한 확인과 DB 함수의 같은 반 권한 재검사를 모두 거칩니다. 공지 수정 본문에는 title/body만 허용합니다.

공지·반 소속 테이블과 관리용 DB 함수 준비 SQL은 [docs/STAGE8_STORAGE.sql](docs/STAGE8_STORAGE.sql)에 제안만 했으며 **실제 DB에 적용하지 않았습니다**. 기존 메모 변경이나 자료·사용자 삽입은 없습니다. 미준비 상태의 502/503을 접근 제어 성공으로 보고하지 않습니다. 실제 공지 읽기·강사 수정·운영 엔진의 새 서비스 등록은 미확인입니다. 이전 단계의 실제 재로그인 연결 실측도 여전히 미실행입니다.

### 확인 순서와 결과

1. `npm run decider:test`: 기존 기기·복합 사건·가상 재확인 4항목 통과.
2. `npm run fixture:7`: 정상 allow, 복합 사건 step_up.
3. `node --experimental-test-module-mocks --test test/zones-stage8.test.mjs test/decider-stage7.test.mjs test/notes-auth.test.mjs`: 가상 판정·모의 API 시험 8개 통과. 비UUID 메모 단건 허용, 목록·공지 쓰기·강사 자료·미지 경로·쿼리 거부, 직접 API의 타인 메모·다른 반 공지 거부, 역할 위조 거부와 저장된 강사 권한을 시험했습니다. 실제 계정·DB 시험은 아닙니다.
4. `npm run build -- --local`: 로컬 빌드 성공. 화면 메뉴 변경 없음.
5. 실제 화면 확인은 기존 자료실에서 **로그인 → 자기 메모 열기**로 합니다. 구역 판정의 목록 거부와 공지·강사 권한 확인은 메뉴 노출만으로 확인하지 않고, 준비된 엔진·DB에서 직접 API/단건 요청으로 별도 확인해야 합니다. 이번에는 실제 계정 시험을 하지 않았습니다.

제출 묶음 첫 실행은 기존 자기 점검의 2~7단계 제한으로 실패했습니다. 첫 오류만 근거로 `src/attack-check.mjs`의 허용 단계에 8을 추가했습니다.

설정의 `allowedRoutes`는 판정기가 허용 후보로 삼는 **GET /api/notes/:id**, **GET /api/announcements/:id** 두 경로뿐입니다. 기존 Vercel 배포 주소, Supabase 로그인 발급자·공개키 주소·audience, 원본 메모 API 주소, judgeIssuer, 미설정 restoreRoute는 보존했습니다. 기존 직접 API의 CRUD를 판정기 경로 허용과 혼동하지 않습니다. 커밋 후 `npm run bundle`은 실제 HTTP 자기 점검을 기록하며 심판 판정이나 실제 소유자·강사 시험을 대신하지 않습니다. 생성 JSON과 bundle-notes.json은 커밋하지 않습니다.

## 이전 저장점: 「7단계 저장점」 — 2026-11-02 (한국 시간)

시작 시 마지막 커밋 `b0329bb` 「6단계 저장점」과 README·설정의 단계 6은 일치했고 Git 작업 폴더는 깨끗했습니다. 6단계 배포도 같은 커밋과 단계로 확인됐습니다. 아래 이전 저장점의 미배포 설명은 당시 기록입니다. 현재 `aleph.config.json.step`은 7입니다.

### 입력 출처와 이번 규칙

- `src/access-signals.mjs`는 엔진 전용 요청에서 `signals.source`를 구분합니다. `judge_fixture`는 가상 시험 정보, `none`은 실제 경로의 정보 미제공, 나머지·누락은 출처 불명입니다. 클라이언트 헤더·위치·시각을 이 값으로 승격하거나 기본 정상값으로 채우지 않습니다. 이 검사는 출처 문자열 자체를 암호학적으로 인증하지 않습니다. 엔진이 검증해 전달한 요청만 받는 기존 계약이 전제입니다.
- 가상 판정에 사용하는 입력은 지역(local/foreign), 네트워크(usual/unusual), 정수 시각(0~23), 최대 12건의 최근 사건 배열이 모두 있는 경우입니다. 사건의 경과 시간·횟수도 음수가 아닌 안전한 정수여야 합니다. 누락·불명확한 값은 `fixture: null`로 남습니다. `none/unknown`은 정상 접속 증거가 아니며 가상 이상 규칙을 적용하지 않고 기존 기기·읽기 정책을 유지합니다.
- `step_up_required` 규칙은 가상 사건의 **심야(0~7시 또는 21~23시) + unusual 네트워크 + 최근 60초 이내 risk_signal 20건 이상**이 겹칠 때 `step_up`·`step_up_required`와 규칙 ID를 반환합니다. 제공된 `risk_signal`은 가상 다량 접근 표식으로만 사용하며 실제 읽기 건수를 관측한 결과가 아닙니다. 지역 하나만으로는 차단하지 않습니다.
- 가상 시험에서만 엔진 계약 형태의 `stepUp.verified === true`와 정수 `authAgeSeconds` 0~900초를 확인한 새 요청을 다시 판정해 허용합니다. 기존 `device_registered`가 먼저 적용되므로 미등록·누락은 재확인 값과 관계없이 거부됩니다. `starter.deny`와 읽기 외 기본 거부, 기존 로그인·자기 메모 CRUD·소유자 검사는 보존했습니다.

### 실제 재로그인 계약 확인 결과

`docs/DECIDER_REQUEST.md`에는 `stepUp` 두 항목이 있지만 같은 주체의 새 로그인을 검증하는 접수 경로·검증 완료 증거·요청 재실행 연결 계약은 제공되지 않았습니다. 저장소에도 해당 엔진 연결 구현이 없습니다. 문서도 이 값만으로 실제 재인증 확인을 건너뛰지 말라고 명시합니다. 따라서 **실제 자료 차단 → 같은 내 계정으로 재로그인 → 새 요청 허용 실측은 미실행**입니다. 이번 변경은 판정기의 가상 사건 규칙이며 직접 자료 API에 재인증 연결을 임의로 만들지 않았습니다. 실제 지역·네트워크 이력을 수집하거나 토큰 원문을 기록하지 않았습니다.

### 다시 실행과 실제 확인 결과

1. `npm run decider:test`: 등록 정상·미등록 거부·복합 이상 추가 확인·가상 재확인 후 허용 4개 통과.
2. `npm run fixture:7`: 정상 사건 `allow`, 복합 이상 사건 `step_up`.
3. `node --test test/decider-stage7.test.mjs`: 입력 누락·출처 불명·헤더 위조, 지역 단독 및 복합 조건, 재확인 시간 경계·기기 규칙 보존 시험 3개 통과.
4. `npm run build -- --local`: 로컬 빌드 성공. 실제 배포나 심판 통과를 뜻하지 않습니다.
5. 화면 확인은 실제 엔진 연결 계약이 제공된 뒤에만 합니다. 운영 측 자료실에서 복합 사건 발생 → 추가 로그인 화면 → 같은 계정 재로그인 → 새 요청 재판정 순서를 확인해야 합니다. 현재 그 화면·실제 차단·재허용 결과는 미확인입니다. 설치할 접속 프로그램은 추가하지 않았습니다.

제출 묶음 첫 실행은 자기 점검의 2~6단계 제한으로 실패했습니다. `src/attack-check.mjs`에서 7단계도 기존 HTTP 점검을 실행하도록 허용 범위만 확장했습니다.

설정 대조: 기존 Vercel 주소 `https://choi-bujang-secret-vault-flax.vercel.app/`, Supabase 발급자 `https://lgpldyanjdhloxlslvrn.supabase.co/auth/v1`, 그 아래 `/.well-known/jwks.json`, audience `authenticated`, 다섯 자료 API 허용 경로, 원본 API `https://lgpldyanjdhloxlslvrn.supabase.co/rest/v1/training_notes`, `judgeIssuer`와 미설정 `restoreRoute`를 보존했습니다. 원본 주소 등록은 원본 차단 검증을 뜻하지 않습니다. `npm run bundle`은 실제로 요청한 HTTP 응답만 기록하며 가상 사건이나 실제 재로그인을 HTTP 성공으로 바꾸어 기록하지 않습니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.

## 이전 저장점: 「6단계 저장점」 — 2026-11-02 (한국 시간)

`aleph.config.json.step`은 6입니다. 마지막 기준 커밋 `1595847`에서 원본 API 주소가 등록됐으나 README에는 미설정으로 남아 있던 차이를 정리했습니다. 아래 4단계 이하 설명은 당시 기록입니다.

- 기존 로그인·자기 메모 CRUD·API 소유자 검사는 보존했습니다. 판정 요청의 사용자는 엔진이 확인한 `subjectId`, 기기 등록 여부는 최상위 `deviceRegistered`입니다. 사용자 ID를 임의로 추가하거나 Supabase 사용자 번호와 직접 비교하지 않습니다.
- `device_registered` 규칙은 `deviceRegistered === true`인 `notes` 서비스의 GET 읽기(`GET /notes`, `GET /notes/:id`)만 `allow`·`approved`로 허용합니다. 미등록·누락·불리언 true가 아닌 값은 `deny`·`device_not_registered`로 거부합니다. 기존 `starter.deny`는 다른 요청의 기본 거부로 보존했습니다. 응답 다섯 항목과 함수 계약은 유지했습니다.
- 설정을 코드와 대조했습니다. 배포 주소는 `https://choi-bujang-secret-vault-flax.vercel.app/`, 로그인 발급자는 `https://lgpldyanjdhloxlslvrn.supabase.co/auth/v1`, 공개키 주소는 발급자의 `/.well-known/jwks.json`, audience는 `authenticated`입니다. 기존 다섯 `/api/notes` 허용 경로와 `judgeIssuer`는 보존했습니다. 엔진 판정 경로 `/notes`와 공개 API 경로 `/api/notes`를 구분합니다.
- 원본 API는 `https://lgpldyanjdhloxlslvrn.supabase.co/rest/v1/training_notes`로 등록돼 있습니다. `restoreRoute`는 미설정입니다. 주소 등록만으로 원본 API 차단이나 5단계 전체 보호를 검증한 것은 아닙니다.

### 확인 순서와 실제 결과

1. 저장소 폴더에서 `npm run decider:test`를 실행합니다. 별도로 설치할 접속 프로그램이나 설치 명령은 없습니다.
2. 2026-11-02 실제 출력: `통과 · 등록 기기의 정상 요청`, `통과 · 미등록 기기의 가상 요청`.
3. 같은 가상 요청의 응답을 별도로 확인했습니다. 등록 기기는 `allow`·`approved`, 미등록과 등록 여부 누락은 `deny`·`device_not_registered`였습니다. 문자열 true도 거부됐고 읽기 외 요청에는 기존 기본 거부가 유지됐습니다.
4. 이 시험은 로컬 가상 요청 연습입니다. 실제 릴레이는 미등록 기기를 판정기보다 먼저 차단하며, 미등록 기기 공격은 심판이 수행합니다. 심판 통과·실제 기기 등록·실제 접속 성공을 확인한 결과가 아닙니다.
5. 실제 화면 확인은 운영 측의 기기 등록 절차를 마친 뒤 자료실에서 **로그인 → 메모 목록/카드 열기** 순서입니다. 정상 등록 기기의 읽기는 허용돼야 하며 미등록 요청은 거부돼야 합니다. 이번 작업에서 운영 등록 화면·실제 계정·DB 권한·최신 배포는 검증하지 않았습니다.

제출 묶음의 첫 실행은 자기 점검의 2~4단계 제한으로 실패했습니다. `src/attack-check.mjs`의 허용 단계를 2~6으로 확장했고 기존 HTTP 점검 내용은 유지했습니다.

인증서·CA·서명 키·개인키를 새로 만들거나 저장하지 않았습니다. 커밋 후 `npm run bundle`로 제출 JSON을 생성합니다. 묶음의 HTTP 자기 점검은 등록된 기존 배포를 대상으로 하므로 현재 로컬 규칙의 배포나 심판 판정을 증명하지 않습니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 포함하지 않습니다.

## 이전 저장점: 「4단계 저장점」 — 2026-10-30 (한국 시간)

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
