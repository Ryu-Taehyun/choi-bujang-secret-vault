# 8단계 자원과 서버 권한

판정 요청의 18개 항목을 유지합니다. 새 `resourceId`나 `role`을 요청에 만들지 않습니다.
서버는 검증된 서비스와 단건 경로에서 자원 ID를 도출합니다.

| 자원 | 엔진 service | 엔진 method / route / path | 공개 API | 자원 ID |
| --- | --- | --- | --- | --- |
| 자기 메모 | notes | GET /notes/:id /notes/실제ID | GET /api/notes/:id | notes:실제ID |
| 반 공지(강사 작성) | announcements | GET /announcements/:id /announcements/실제ID | GET /api/announcements/:id | announcements:실제ID |
| 강사 자료 | instructor-materials | 모두 거부 | /api/instructor-materials/:id도 거부 | instructor-materials:실제ID |

자원 ID는 같은 원본 ID라도 서비스별로 다릅니다. HTTP `X-Resource-Id` 헤더로 표시하며 기존 메모 JSON에는 필드를 추가하지 않습니다. 비ASCII ID는 헤더에서 URL 인코딩합니다. 기존 메모 목록 주소의 헤더는 `notes:collection`입니다. 강사 자료 API는 자료를 읽지 않고 403을 반환합니다.

판정기는 service·method·route·실제 path를 함께 대조하고 쿼리 길이 0만 허용합니다. ID는 UUID로 제한하지 않지만 한 경로 조각이어야 합니다. 중첩 경로·퍼센트 인코딩·경로 이동·공백과 export/import/search/bulk/admin 예약 이름은 거부합니다. 이 이름의 기능 경로를 ID와 같은 깊이에 구현하지 않습니다. 목록, 모든 쓰기, 강사 자료와 알 수 없는 경로는 `starter_not_ready`와 `resource_zone` 규칙으로 기본 거부합니다. 새 이유 코드는 만들지 않았습니다. 기기 등록과 복합 가상 사건 추가 확인은 허용 후보 경로에도 계속 적용됩니다. 메모 소유자 비교는 API만 수행합니다.

## 자료 API의 별도 확인

- 기존 `/api/notes`와 `/api/notes/:id` 주소, 자료, 자기 메모 CRUD를 보존합니다. 판정기 허용 목록에는 단건 GET만 남습니다. 기존 API의 직접 목록·쓰기 기능을 판정기가 허용한다는 뜻은 아닙니다. API는 모든 조회·수정·삭제에 검증된 사용자 ID의 owner_id 조건을 넣고 응답 소유자와 단건 ID도 재확인합니다. 타인·소유자 없는 메모는 `NOTE_NOT_FOUND` 404입니다.
- 공지 GET은 검증된 사용자 ID로 `training_class_memberships`의 저장된 반 소속을 조회하고 그 반의 `training_announcements`만 조회합니다. 다른 반은 `RESOURCE_NOT_FOUND` 404, 소속 없음은 `CLASS_MEMBERSHIP_REQUIRED` 403입니다. 공지의 학생 경로는 강사를 포함한 누구에게나 쓰기 405를 반환합니다.
- 공지 수정은 별도 **PUT /api/admin/announcements/:id**에서만 처리합니다. 이 경로는 판정기 허용 목록에 없습니다. 서버는 검증된 사용자 ID의 저장된 instructor 권한을 확인하고, DB 함수가 같은 공지의 반 소속·강사 권한을 수정문 안에서 다시 대조합니다. 클라이언트 body는 title/body 두 항목만 허용하며 role·class_id·actor 등은 거부합니다. 권한 없음은 `INSTRUCTOR_REQUIRED` 403, 같은 반 대상 없음은 404입니다.
- 화면 메뉴·헤더·쿼리·본문 role/userId는 권한 근거가 아닙니다. 오류는 고정된 짧은 코드로만 반환하며 토큰·자료 본문·DB 오류 원문은 로그에 남기지 않습니다. 새 API 경로는 Vercel 파일 기반 단건 경로이며 쿼리로 기능을 선택하지 않습니다. 기존 메모 rewrite의 noteId는 기존 주소 처리를 위한 ID 전달을 보존한 것입니다.

## 실제 DB 준비 여부

이 저장소에는 기존 공지·반 소속 테이블이 없었습니다. 준비용 `docs/STAGE8_STORAGE.sql`은 **제안이며 실행하지 않았습니다**. 메모 테이블 변경·자료 삽입·사용자 생성은 포함하지 않습니다. 관리자가 공식 Supabase SQL Editor에서 구조와 권한을 검토해 적용하고 반 소속·강사 권한·가상 공지를 별도로 등록해야 합니다. 클라이언트에게 이 테이블의 직접 권한을 주지 않습니다. DB 함수도 service_role만 호출할 수 있습니다.

실제 준비 전에는 API가 502/503으로 자료를 내보내지 않습니다. 이를 정상 권한 검증 성공으로 기록하지 않습니다. 실제 계정·공지·강사 DB 시험은 미실행이며 모의 DB 시험과 구분합니다. 운영 엔진에 announcements 서비스와 경로가 등록됐는지도 별도 확인이 필요합니다. 서버 관리 API는 판정기 밖의 서버 인증·DB 권한 검사로 보호됩니다.
