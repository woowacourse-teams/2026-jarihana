# Blue-Green 배포 실행

배포 대상을 고르고 Production Release를 실행할 때 읽는다.
환경 준비와 최초 worker 등록은 [서버 구성](server-setup/README.md), 구성요소와 인계 규칙은 [동작 구조](architecture.md)를 따른다.
실행 뒤에는 [상태 확인](status.md), 실패하거나 상태가 불확실하면 [장애 복구](recovery.md)를 확인한다.

- [적용 버전](#적용-버전)
- [운영 적용 상태](#운영-적용-상태)
- [배포 실행](#배포-실행)

## 적용 버전

이 문서는 같은 checkout의 workflow와 스크립트를 기준으로 한다.
운영 앱 Compose는 배포 실행의 main 커밋 SHA에, 배포 제어 코드와 watchdog은 관리자가
설치한 control ref/SHA에 각각 귀속된다. 두 버전은 같을 필요가 없다.
Git 병합만으로 서버의 보호 설정과 제어 코드가 갱신되었다고 판단하지 않는다.

점검 제외와 0건 지표 초기화를 도입할 때는 [앱과 제어기의 적용 순서](../../docs/observability/PROBE-METRICS-ROLLOUT.md#앱과-배포-제어기의-적용-순서)를 먼저 따른다.
무트래픽 구간에서 무엇을 확인할 수 있는지는 [상태 확인의 검증 범위](status.md#사용자-요청이-없을-때의-검증-범위)에서 구분한다.

## 운영 적용 상태

인프라 ADR 0005/0006의 배포 경로는 운영에서 사용 중이다.
2026-11-11의 [Production Release #42970839133](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/42970839133)은
`92a38bb4fb4a7b37ecb58069dcabd25939ed53fb` 제어 코드로 완료됐다.
당시 제어 태그는 `refs/tags/deployment-control-prod-20261111-01`이다.

아래 Compose 계약 검증 v2는 저장소의 변경이며, 위 실행이 이 변경을 운영에서 검증한 근거는 아니다.
2026-11-11 서버 조회에서 Nginx와 앱 B는 위 제어 버전이었고 앱 A는 중지되어 내부 설정을 조회하지 않았다.
이번 변경에서는 서버 설정, 제어 pin과 watchdog을 갱신하지 않는다. 최초 적용 조건은 아래에 따른다.
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

운영 `prepare`는 배포를 시작한 main 커밋의 `infra/blue-green-deploy/controller/app-compose.yml`과
`app-music-compose.yml`을 함께 사용한다. 두 파일은 같은 SHA에서 읽고, 합쳐진 실행 모델을 검증한다.
runner는 checkout HEAD와 `GITHUB_SHA`가 같은지 확인하고, 작업 디렉터리의 수정 파일이 아닌
해당 Git 객체의 원본을 읽는다. 배포 도중 이동하는 main이나 최근 서버 파일을 다시 선택하지 않는다.
배포 저널의 `sha`와 `image`는 소스 커밋과 이미지 digest이며, Compose의 커밋과 파일 SHA-256은
prepare 로그에 기록한다. 렌더링된 환경 변수와 비밀값은 로그나 artifact에 올리지 않는다.

기존 제어 태그의 Compose와 파일 내용이 같아야 한다는 검사는 사용하지 않는다.
Docker Compose가 실제 환경 변수로 해석한 JSON 모델을 컨테이너 교체 전에 검증한다.
파일 기반 env 주입은 보간 전 모델에서도 확인해 차단한다. Docker가 literal `$`를 보존하도록 출력한
검증된 모델 자체를 실행 스냅샷으로 사용해 pull/up에서 외부 파일 재조회로 설정이 달라지지 않게 한다.
비밀값을 포함할 수 있는 임시 모델과 실행 스냅샷은 권한 0600으로 만들고 종료 시 삭제한다.

| 구분 | 적용 범위 |
| --- | --- |
| 앱 릴리스에서 변경 가능 | 일반 앱 환경 변수, 메모리/CPU/PID 제한, 허용된 heap 설정, label, healthcheck와 local/json-file 로그 설정 |
| 배포 계약으로 검증 | 지정 이미지 digest와 컨테이너 이름, 환경별 DB URL과 프로필, 앱/loopback 관리 포트, worker 제어/PAUSED/host ID/토큰, restart=no와 정상 종료 설정 |
| 허용하지 않는 실행 구조 | 추가 서비스, build/command/entrypoint 변경, host mount/volume, privileged/capability/user 변경, 외부/host network, env_file와 config/secret 파일 주입 |
| 설정 우회 차단 | Spring 직접 속성 별칭, SPRING_APPLICATION_JSON, 추가 JVM system property와 launcher 환경 변수 |

JVM heap은 `-Xms<size> -Xmx<size>` 형식이며, 종료 설정은 graceful/90초와 Compose 120초를 유지한다.
새로운 실행 구조나 계약 변경은 검증기를 함께 검토해야 한다. 임의의 Compose 변경을 모두 허용하는 기능은 아니다.
Variables와 Secrets는 앱 작업 workflow에서 전달하므로 새 입력이 필요하면 해당 전달 항목도 추가한다.

`resolve`는 검증기 지원 여부와 배포 커밋의 Compose 존재를 확인한다. 실제 변수와 호스트 설정을 쓰는
계약 검사는 앱 runner의 `prepare`에서 수행한다. 이 시점에는 대기 EC2가 시작됐을 수 있지만,
검사 실패 시 기존 대기 컨테이너의 중지/삭제와 후보 기동, worker 이관, HTTP 전환은 시작하지 않는다.
오류 시 두 EC2와 증거를 보존하는 기존 실패 절차를 유지한다.

### 최초 적용과 자동화 범위

이 workflow를 main에 반영하기 전에 `APP_RELEASE_COMPOSE_CAPABILITY=2`의 `app.sh`와
`app_validate_release_compose`가 포함된 제어 릴리스를 [수동 제어 버전 교체](control-upgrade.md)로
한 번 설치해야 한다. v1 설치 상태에서는 `resolve`가 새 배포를 차단한다.
기존 제어 태그 자체와 서버의 보호된 control SHA 검증은 유지한다.

이 최초 적용 후 위 계약을 지키는 앱 Compose 변경에는 제어 태그 교체가 필요 없다.
제어 태그 자동 발급, root 업그레이드 helper, 세 호스트 pin 자동 교체 기능은 제공하지 않는다.
제어 스크립트 자체, Nginx/관측 Compose, systemd, topology와 secret 저장 설정은 별도 관리 대상이다.
Compose를 새로 사용한다는 이유로 이 파일들까지 설치됐다고 판단하지 않는다.

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
