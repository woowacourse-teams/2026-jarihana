# Blue-Green 배포 실행

배포 대상을 고르고 Production Release를 실행할 때 읽는다.
환경 준비와 최초 worker 등록은 [서버 구성](server-setup/README.md), 구성요소와 인계 규칙은 [동작 구조](architecture.md)를 따른다.
실행 뒤에는 [상태 확인](status.md), 실패하거나 상태가 불확실하면 [장애 복구](recovery.md)를 확인한다.

- [적용 버전](#적용-버전)
- [운영 적용 상태](#운영-적용-상태)
- [배포 실행](#배포-실행)

## 적용 버전

운영 배포 스크립트, Nginx 템플릿과 앱 Compose는 모두 해당 실행을 시작한 main 커밋의
`github.sha`를 사용한다. 대기 중 main에 다른 커밋이 들어와도 이번 실행의 SHA는 바뀌지 않는다.
최초 전환 이후에는 배포 버전을 지정하기 위한 제어태그 생성, GitHub 변수 변경과 서버의 버전 pin 교체가 필요 없다.
개발 Blue-Green도 같은 방식으로 해당 develop 실행의 SHA를 사용한다.
서버의 주소, 권한, 토큰과 설치형 watchdog/수집기는 [서버 구성](server-setup/README.md)에서 관리한다.

점검 제외와 0건 지표 초기화를 도입할 때는 [앱과 제어기의 적용 순서](../../docs/observability/PROBE-METRICS-ROLLOUT.md#앱과-배포-제어기의-적용-순서)를 먼저 따른다.
무트래픽 구간에서 무엇을 확인할 수 있는지는 [상태 확인의 검증 범위](status.md#사용자-요청이-없을-때의-검증-범위)에서 구분한다.

## 운영 적용 상태

인프라 ADR 0005/0006의 배포 경로는 운영에서 사용 중이다.
2026-11-11의 [Production Release #42970839133](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/42970839133)은
`92a38bb4fb4a7b37ecb58069dcabd25939ed53fb` 제어 코드로 완료됐다.

아래 main SHA의 Compose 사용 방식은 저장소의 변경이며, 위 실행이 이 변경을 운영에서 검증한 근거는 아니다.
2026-11-11 서버 조회에서 Nginx와 앱 B는 위 제어 버전이었고 앱 A는 중지되어 내부 설정을 조회하지 않았다.
이번 PR은 실제 서버 설정과 설치형 도구를 변경하지 않는다. 기존 운영 환경의 최초 전환은
[SHA 배포 전환](release-sha.md)을 따르며, 그 준비를 마친 이후 일반 배포에는 별도 버전 교체가 없다.
정상 배포 완료가 장애를 유발한 동반 롤백, 취소 복구와 빈 서버 재구성의 검증까지 의미하지는 않는다.

## 배포 실행

운영 진입점은 [Production Release](../../../.github/workflows/backend-prod-deploy.yml)다.
배포 대상 경로가 변경된 main push 또는 main의 수동 실행으로
[공통 배포 workflow](../../../.github/workflows/backend-bluegreen-deploy.yml)를 호출한다.
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
[프론트 빌드 workflow](../../../.github/workflows/frontend-prod-deploy.yml)는 호출형 빌드 전용이다.

백엔드 이미지는 develop의 GitHub-hosted ARM runner가 빌드해 GHCR에 올린 것을 사용한다.
운영에서는 `tree-<backend 트리 해시>` 또는 지정 SHA를 실제 `sha256` digest로 해석해 고정한다.
프론트엔드는 릴리스와 같은 소스 SHA로 빌드하고 같은 실행에서 반환한 artifact ID로 전달한다.

### 운영 백엔드의 Compose 선택

운영 `prepare`는 배포를 시작한 main 커밋의 `infra/blue-green-deploy/controller/app-compose.yml` 하나를 사용한다.
음악 기능의 `YOUTUBE_DATA_API_KEY`도 이 파일의 환경 변수에 포함하며,
앱 작업 workflow가 GitHub Secrets에서 전달한다. 키가 미설정이면 기존처럼 빈 값을 전달한다.
runner는 checkout HEAD와 `GITHUB_SHA`가 같은지 확인하고, 작업 디렉터리의 수정 파일이 아닌
해당 Git 객체의 원본을 읽는다. 배포 도중 이동하는 main이나 최근 서버 파일을 다시 선택하지 않는다.
배포 저널의 `sha`와 `image`는 소스 커밋과 이미지 digest다. Compose 원본의 커밋과 파일 SHA-256은
prepare 로그와 앱 작업 결과(receipt)의 `compose_source.commit`, `compose_source.sha256`에 기록한다.
coordinator는 receipt를 저널에 저장하며, 이후 앱 단계와 frontend-only 배포에도 같은 앱의 출처를 보존한다.
출처가 없는 기존 앱은 `compose_source: null`로 남기고 현재 실행 SHA로 추측해서 채우지 않는다.
렌더링된 환경 변수와 비밀값은 로그나 artifact에 올리지 않는다.

`resolve`는 `docker compose config --no-interpolate --format json`으로 Compose를 읽고,
정규화된 backend 설정에서 이미지/DB/프로필, 포트와 worker 시작 조건 등 배포에 필요한 계약을 검사한다.
실제 비밀값을 전달하거나 컨테이너를 기동하지 않는다. 메모리 제한과 일반 환경 변수 변경을 일괄 금지하지 않는다.
필수 항목은 현재 Compose의 변수 연결과 짧은 포트 표기를 계약으로 검사한다. 해당 변수식이나 포트 표기를
바꾸면 사전 검사도 함께 수정해야 하며, 실제 값이 같다는 이유만으로 모든 표기 변경을 허용하지는 않는다.
앱 runner의 `prepare`에서는 실제 환경 변수로 `docker compose config --quiet`를 다시 수행한 뒤
같은 파일로 pull/up한다. 별도 Python/YAML 파서는 추가하지 않는다.

이미지 digest, DB/프로필, 관리 포트와 worker 설정은 앱 Compose에 정의한다.
기동 후에는 기존 앱 상태/컨테이너 검사와 readiness 확인을 거쳐야 worker 이관과 HTTP 전환을 진행한다.
Variables와 Secrets는 앱 작업 workflow에서 전달하므로 새 입력이 필요하면 해당 전달 항목도 추가한다.
원본 임시 파일은 권한 0600으로 만들고 종료 시 삭제한다. 렌더링된 비밀값을 별도 파일로 저장하지 않는다.

백엔드를 교체하는 deploy의 Compose 문법/필수 조건 오류는 `resolve`에서 차단한다.
이 단계는 새 배포 저널 생성과 대기 EC2 시작보다 앞선다. frontend-only와 기존 컨테이너를 등록하는
bootstrap은 이 검사를 건너뛴다. frontend-only는 앱 `prepare`도 실행하지 않는다.
사전 검사는 실제 서버 입력과 컨테이너 상태까지 보장하지 않는다. 비밀값 누락, 이미지 pull 실패와 readiness 등은
여전히 `prepare`에서 실패할 수 있다. 실제 값으로 수행하는 Compose 검사 실패는 기존 대기 컨테이너의
중지/삭제 전에 멈추지만, 이 시점에는 대기 EC2가 시작됐을 수 있다.
`prepare` 실패는 이미 만든 배포 저널을 자동 완료로 되돌리지 않는다. `NEEDS_ATTENTION`이나 pending이
남으면 Compose 수정 후 다시 머지해도 다음 plan이 차단될 수 있으므로 [수동 조사](recovery.md#수동-조사)를 먼저 따른다.

### 배포 스크립트와 서버 설치 범위

Actions의 앱 작업, coordinator 단계와 queue guardian은 같은 `github.sha`를 checkout한다.
`bg_init`은 checkout SHA를 부모 workflow의 SHA와 대조하며, GitHub run/저장소/branch,
실제 EC2와 작업 허가도 계속 검사한다. 이전 경로의 스크립트나 설치된 앱 Compose로 대체하지 않는다.
서버 설정에는 환경과 호스트 topology를 두고 배포 코드 버전은 저장하지 않는다.
저널과 프론트 상태는 소스 SHA, 이미지 digest, run/deployment ID로 실행을 식별한다.

watchdog은 runner가 멈춰도 저널 만료를 감지하는 설치형 도구다. 앱 Compose를 선택하거나
배포하지 않으며, 배포 SHA와 watchdog 설치 SHA가 같아야 한다는 조건은 없다.
watchdog/수집기 자체를 수정할 때는 관리자가 설치본을 갱신한다. 일반 배포 코드는 Actions가 매번 가져온다.
최초 설치는 [서버 구성](server-setup/README.md), 기존 환경 전환은 [SHA 배포 전환](release-sha.md)을 따른다.

### 정상 배포 순서

```text
Compose 사전 검사와 이미지 선택, 필요한 프론트 빌드
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
정상 종료된 이전 컨테이너는 삭제하지 않고 중지된 EC2에 보존한다. 다음 배포에서 그 슬롯을
후보로 쓸 때 새 Compose 검증과 이전 정상 종료 증거 확인을 마친 뒤 삭제하고 새 컨테이너를 만든다.
관찰 5분이 지났다는 이유만으로 삭제하거나, 확정 이후 장애를 자동 롤백하지 않는다.
프론트엔드만 배포하면 EC2 시작과 worker 교대 없이 현재 API와 새 프론트를 관찰한다.
백엔드만 배포하면 공개 프론트 파일은 유지한다. 릴리스 상태 갱신 방식은
[프론트엔드 릴리스](architecture.md#프론트엔드-릴리스)를 따른다.

worker 인계, 이전 앱 종료와 프론트 게시의 상세 규칙은 [동작 구조](architecture.md)를 따른다.

제어 코드나 관측 설정을 바꿨다면 [검증 가이드](verification.md)에서 필요한 검증을 확인한다.
