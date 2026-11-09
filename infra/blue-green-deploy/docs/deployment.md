# Blue-Green 배포 실행

배포 대상을 고르고 Production Release를 실행할 때 읽는다.
환경 준비와 최초 worker 등록은 [서버 구성](server-setup/README.md), 구성요소와 인계 규칙은 [동작 구조](architecture.md)를 따른다.
실행 뒤에는 [상태 확인](status.md), 실패하거나 상태가 불확실하면 [장애 복구](recovery.md)를 확인한다.

- [적용 버전](#적용-버전)
- [운영 적용 상태](#운영-적용-상태)
- [배포 실행](#배포-실행)

## 적용 버전

이 문서는 로컬 `origin/main`의 [2f2cc2cc 코드](https://github.com/woowacourse-teams/2026-jarihana/tree/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd)를 기준으로 한다.
workflow, 스크립트와 설정의 코드 링크도 이 커밋에 고정한다. 명령은 이 기준과 일치하는
checkout에서 실행하고, 서버의 보호된 control ref/SHA와 설치본도 별도로 대조한다.
문서나 Git 병합만으로 서버 설정과 설치 코드가 갱신되었다고 판단하지 않는다.

점검 제외와 0건 지표 초기화를 도입할 때는 [앱과 제어기의 적용 순서](../../docs/observability/PROBE-METRICS-ROLLOUT.md#앱과-배포-제어기의-적용-순서)를 먼저 따른다.
무트래픽 구간에서 무엇을 확인할 수 있는지는 [상태 확인의 검증 범위](status.md#사용자-요청이-없을-때의-검증-범위)에서 구분한다.

## 운영 적용 상태

인프라 ADR 0005/0006의 배포 경로는 운영에서 사용 중이다.
[Production Release #41106588247](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/41106588247)은
위 적용 버전으로 프론트 빌드, A/B 전환, HTTP/worker 관찰과 배포 확정을 완료했다.
프론트 게시가 일반 A/B 배포의 `switch` 내부에서 실행되므로,
이 실행의 frontend-only 전용 `frontend-publish` job이 skipped인 것은 게시 미실행을 뜻하지 않는다.

이 근거는 정상 배포 경로의 운영 적용을 확인한 것이다. 실제 장애를 유발한 프론트/백엔드
동반 롤백, 취소 복구와 빈 AWS 서버의 전체 재구성까지 검증한 근거는 아니다.
관측 코드의 Git 병합과 서버 설치도 별개이며, 점검 지표의 적용 경계는
[배포 점검 지표 적용 상태](../../docs/observability/PROBE-METRICS-ROLLOUT.md)에서 확인한다.

## 배포 실행

운영 진입점은 [Production Release](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-prod-deploy.yml)다.
배포 대상 경로가 변경된 main push 또는 main의 수동 실행으로
[공통 배포 workflow](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-bluegreen-deploy.yml)를 호출한다.
`BLUE_GREEN_PROD_ENABLED=true`여야 새 운영 배포를 진행한다. false 또는 미설정이면
현재 서비스를 유지한 채 새 deploy를 차단한다. 기존 Recreate 배포로 자동 전환하지 않는다.
명시적인 최초 `bootstrap`만 비활성 상태에서 허용한다. 준비 조건은 [최초 worker 등록](server-setup/README.md#최초-worker-등록)을 따른다.

| 수동 입력 | 사용 방법 |
| --- | --- |
| `blue_green_mode=deploy` | 정상 배포. 기본값이며 최초 등록을 대신하지 않는다. |
| `blue_green_mode=bootstrap` | 이미 준비된 활성 앱의 최초 worker 권한 등록. HTTP 전환과 S3 게시를 하지 않는다. |
| `frontend_only=true` | 현재 백엔드를 유지하고 프론트엔드만 배포. `image_tag`를 비운다. |
| `backend_only=true` | 현재 프론트 파일을 유지하고 백엔드만 교대한다. |
| `image_tag` | 기존 이미지의 40자리 커밋 SHA. deploy에서는 현재 main의 backend tree 이미지와 같은 digest만 허용한다. |

두 only 입력은 동시에 지정하지 않는다. main push에서는 backend 변경만 있으면 backend-only,
frontend 변경만 있으면 frontend-only를 선택한다. infra 또는 공동 배포 workflow 변경은 양쪽 배포다.
독립적인 프론트엔드 운영 게시 workflow는 없으며
[프론트 빌드 workflow](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/frontend-prod-deploy.yml)는 호출형 빌드 전용이다.

백엔드 이미지는 develop의 GitHub-hosted ARM runner가 빌드해 GHCR에 올린 것을 사용한다.
운영에서는 `tree-<backend 트리 해시>` 또는 지정 SHA를 실제 `sha256` digest로 해석해 고정한다.
프론트엔드는 릴리스와 같은 소스 SHA로 빌드하고 같은 실행에서 반환한 artifact ID로 전달한다.

### 운영 백엔드의 Compose 선택

릴리스 Compose 지원을 설치한 뒤 운영 백엔드 배포의 `prepare` 단계는 배포 대상 `main` 커밋의
`app-compose.yml`을 사용한다.
앱 runner는 체크아웃 SHA를 배포 요청과 대조하고, 해당 커밋의 Git 객체에서 파일을 읽는다.
이미지 digest는 배포 저널에, Compose의 커밋과 파일 SHA-256은 prepare 로그에 기록한다.

릴리스에서 자동으로 적용할 수 있는 변경은 backend의 `environment`에서
`JARIHANA_이름: "${JARIHANA_이름:-}"` 형태로 같은 이름의 선택 환경변수를 전달하는 항목이다.
이미지, DB 주소 구성, 포트, 워커 시작 상태 등 그 밖의 파일 내용은 승인된 제어 태그의 템플릿과
같아야 한다. 허용 범위가 다르거나 Compose 파싱에 실패하면 대기 컨테이너를 건드리기 전에 중단한다.
GitHub Variables와 Secrets는 기존 앱 작업 workflow에서 전달한다.

이 workflow를 `main`에 반영하기 전에 `APP_RELEASE_COMPOSE_CAPABILITY=1`을 포함한 제어 태그를
[제어 버전 교체 절차](control-upgrade.md)에 따라 한 번 설치한다. 구형 제어 태그로는 운영 백엔드
배포가 이미지 선택 단계에서 중단된다. 새 제어 태그를 적용한 뒤에는 위 형태의 앱 환경변수를
추가하는 릴리스부터 Compose가 자동으로 적용된다.

### 정상 배포 순서

```text
이미지 선택과 필요한 프론트 빌드
  → 실제 활성 슬롯 확인, 이전 프론트 원본 검증과 새 원본 보관
  → 대기 EC2 시작, 후보 앱 PAUSED 준비와 readiness 및 관측 준비 확인
  → 이전 worker 신규 선점 중단, 발송과 finish commit 완료, DB 권한 반납
  → Nginx 설정 검사 및 전환, 실제 후보 API 응답 확인
  → 변경한 프론트 게시와 공개 파일 해시 확인
  → 후보 worker 활성화
  → 앱 및 HTTP 병렬 관찰
  → 이전 Nginx 연결 종료, 프론트 상태 확정, 배포 확정
  → 후보 권한 COMPLETE, 이전 앱 SIGTERM 정상 종료, 이전 EC2 중지
```

관찰 시간과 통과 조건은 [관찰 기준](status.md#관찰-기준)을 따른다.
프론트엔드만 배포하면 EC2 시작과 worker 교대 없이 현재 API와 새 프론트를 관찰한다.
백엔드만 배포하면 공개 프론트 파일은 유지한다. 릴리스 상태 갱신 방식은
[프론트엔드 릴리스](architecture.md#프론트엔드-릴리스)를 따른다.

worker 인계, 이전 앱 종료와 프론트 게시의 상세 규칙은 [동작 구조](architecture.md)를 따른다.

제어 코드나 관측 설정을 바꿨다면 [검증 가이드](verification.md)에서 필요한 검증을 확인한다.
