# Blue-Green 배포 실행

배포 대상을 고르고 Production Release를 실행할 때 읽는다.
환경 준비와 최초 worker 등록은 [배포 환경 구성](environment.md), 구성요소와 인계 규칙은 [동작 구조](architecture.md)를 따른다.
실행 뒤에는 [상태 확인](status.md), 실패하거나 상태가 불확실하면 [장애 복구](recovery.md)를 확인한다.

- [적용 버전](#적용-버전)
- [배포 실행](#배포-실행)

## 적용 버전

이 문서는 로컬 `origin/main`의 [2f2cc2cc 코드](https://github.com/woowacourse-teams/2026-jarihana/tree/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd)를 기준으로 한다.
workflow, 스크립트와 설정의 코드 링크도 이 커밋에 고정한다. 명령은 이 기준과 일치하는
checkout에서 실행하고, 서버의 보호된 control ref/SHA와 설치본도 별도로 대조한다.
문서나 Git 병합만으로 서버 설정과 설치 코드가 갱신되었다고 판단하지 않는다.

## 배포 실행

운영 진입점은 [Production Release](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-prod-deploy.yml)다.
배포 대상 경로가 변경된 main push 또는 main의 수동 실행으로
[공통 배포 workflow](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-bluegreen-deploy.yml)를 호출한다.
`BLUE_GREEN_PROD_ENABLED=true`여야 새 운영 배포를 진행한다. false 또는 미설정이면
현재 서비스를 유지한 채 새 deploy를 차단한다. 기존 Recreate 배포로 자동 전환하지 않는다.
명시적인 최초 `bootstrap`만 비활성 상태에서 허용한다. 준비 조건은 [최초 worker 등록](environment.md#최초-worker-등록)을 따른다.

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
