# ADR 0023. 롤백은 직전 성공 릴리스의 설정까지 되돌리고, prod는 dev 점검을 통과한 digest만 배포한다

- 상태: 제안(초안, 팀 합의 대기)
- 날짜: 2026-10-15
- 관련 문서: [백엔드 ADR 목록](README.md),
  [GHCR 전달 ADR](0016-github-hosted-build-and-ghcr.md),
  [백엔드 개발 배포 워크플로](../../../.github/workflows/backend-dev-deploy.yml),
  [백엔드 운영 배포 워크플로](../../../.github/workflows/backend-prod-deploy.yml),
  [배포 후 점검 스크립트](../../../infra/scripts/verify-backend.sh),
  [Flyway baseline 운영 문서](../operations/flyway-baseline.md)

## 배경

[백엔드 ADR 0016](0016-github-hosted-build-and-ghcr.md)에 따라 백엔드 이미지는 GitHub 호스팅 ARM
runner가 빌드해 GHCR에 올리고, dev와 prod EC2의 runner가 그 이미지를 받아 Compose로 교체한다.
교체 뒤 `infra/scripts/verify-backend.sh`가 실패하면 runner 홈에 기록된 직전 성공 태그로 자동
롤백한다(결정 4). 2026-10-12 dev 수동 배포([실행 38209431773](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/38209431773))에서
점검이 실패했고, 직전 성공 태그로 되돌린 뒤 같은 점검을 통과했다. 이미지 롤백은 의도대로 동작한다.

2026-10-15 외부 리뷰는 이 흐름의 빈틈 두 가지를 지적했고, 워크플로 코드에서 둘 다 사실로 확인했다.

### 문제 1. 롤백이 설정 변경 장애를 복구하지 못한다

배포 job은 실행한 커밋을 runner 작업 디렉터리에 체크아웃하고, 그 디렉터리의 다음 파일로 배포와
롤백을 모두 실행한다.

- `infra/docker-compose.yml`(prod), `infra/docker-compose.dev.yml`(dev)
- `infra/monitoring/alloy/config.alloy`(Compose가 Alloy 컨테이너에 bind mount한다)
- `infra/scripts/verify-backend.sh`

"직전 성공 태그로 롤백" 단계는 `BACKEND_TAG`만 직전 성공 태그로 바꾸고 Compose 파일과 Alloy 설정은
이번 배포의 것을 그대로 쓴다. 잘못된 Compose나 Alloy 설정 때문에 점검이 실패했다면 이전 이미지도 같은
설정으로 실행되어 같은 이유로 실패한다. 이전 컨테이너는 `--force-recreate`로 이미 지워졌으므로
서비스는 중단된 채로 남는다.

prod에서는 롤백을 시도조차 하지 않는 경우가 있다. prod는 `BACKEND_TAG`를 `tree-<트리 해시>` 이미지의
revision 라벨에서 정한다. `infra/docker-compose.yml`은 dev 워크플로의 `paths`에 없으므로 이 파일만
바뀐 릴리스는 이미지를 다시 빌드하지 않고, revision 라벨이 직전 성공 태그와 같다. 롤백 단계의 조건
`steps.previous.outputs.tag != env.BACKEND_TAG`(backend-prod-deploy.yml 179행) 때문에 이때는 롤백 단계
자체를 건너뛴다. dev에서도 실행 중인 태그를 수동 실행으로 다시 배포하면 같은 조건으로 건너뛴다.
`config.alloy`처럼 dev 재빌드를 일으키는 파일이 바뀌면 태그가 달라져 롤백은 시도하지만, 위와 같이 새
설정으로 실행되어 실패한다.

### 문제 2. prod가 dev 점검 결과를 확인하지 않는다

prod의 "배포할 이미지 정하기" 단계(backend-prod-deploy.yml 89행)는 GHCR에 `tree-<main의 backend 트리
해시>` 태그가 있는지만 확인한다. dev 워크플로의 build job은 dev 배포와 점검보다 먼저 이 태그를
push하므로, dev 점검에 실패해 롤백된 이미지도 태그는 남는다. 그 코드가 릴리스 병합으로 main에 들어가면
prod는 그 이미지를 배포한다. [백엔드 ADR 0016](0016-github-hosted-build-and-ghcr.md) 결정 5는 이를
"GHCR에 태그가 있다는 것 자체가 dev 검증 통과를 뜻하지는 않는다"며 감수했고, 지금은 사람의 릴리스
병합만이 관문이다.

`tree-` 태그는 같은 트리를 다시 빌드할 때마다 새 이미지로 옮겨진다. develop에 `config.alloy`처럼 dev
배포를 일으키는 infra 파일만 바뀐 커밋이 병합되면 backend 트리는 같지만 build job이 다시 실행된다.
revision 라벨이 새 커밋 SHA로 바뀌므로 digest도 반드시 달라진다. 따라서 prod가 받는 digest는 dev에서
점검한 digest와 다를 수 있다.

### 워크플로로 되돌릴 수 없는 것

backend 컨테이너의 실행 값은 GitHub Environment(dev, prod)의 Variables와 Secrets에서 job `env`로
주입된다. GitHub는 이 값의 이전 내용을 보관하지 않고 Secrets는 다시 읽을 수도 없으므로, 워크플로가
"직전 성공 때의 값"을 되살릴 방법이 없다. job `env`의 이름 목록도 지금 실행 중인 워크플로 파일에서
오므로, 롤백할 때도 새 워크플로의 목록이 쓰인다. 이 ADR은 이 한계를 없애지 못한다. 대신 한계 때문에
롤백이 깨지지 않도록 규칙을 둔다(결정 4).

## 결정

### 흐름 요약

```text
dev  build   : 테스트, jar, 이미지 push(<커밋 SHA>, tree-<해시>) -> digest와 트리 해시 출력
dev  deploy  : 직전 기록 읽기 -> digest로 이미지 받기 -> 릴리스 디렉터리 준비 -> Compose 해석 검증
               -> Alloy 검증 -> 교체 -> 점검 -> 성공 기록 / 실패 시 직전 릴리스로 롤백
dev  promote : (호스팅 runner) digest 대조 -> dev-verified-tree-<해시> 태그
prod deploy  : dev-verified-tree-<main 트리 해시>로 digest 확정 -> 이후 dev deploy와 같은 순서
```

### 1. 성공 기록에 이미지 digest와 설정 커밋을 함께 남긴다

- 기록 파일 경로는 지금처럼 runner 계정 홈의 `.jarihana/backend-<env>-last-success`로 두고, 형식만
  태그 한 줄에서 `이름=값` 줄로 바꾼다.

  ```text
  backend_tag=<APP_VERSION으로 쓰는 커밋 SHA>
  image_digest=sha256:<점검을 통과한 이미지의 digest>
  config_sha=<배포한 워크플로 실행의 GITHUB_SHA>
  release_dir=<결정 2의 릴리스 디렉터리 절대 경로>
  run_url=<기록을 남긴 워크플로 실행 URL>
  ```

- 기록은 점검을 모두 통과한 뒤에만 임시 파일에 쓰고 `mv`로 바꿔 끼운다. 중간에 끊겨도 반쪽 기록이
  남지 않는다.
- 읽을 때는 필요한 키만 골라 읽는다. 파일을 `source`로 실행하지 않는다.
- 이미지를 태그가 아니라 digest로 기록한다. 같은 커밋의 build job을 다시 실행하면 `<커밋 SHA>` 태그도
  새 이미지로 옮겨지지만, digest는 점검한 바로 그 이미지를 가리킨다.
- 옛 형식(태그 한 줄)은 `backend_tag`만 있는 기록으로 읽는다. 이때는 설정을 되돌릴 수 없으므로 지금처럼
  이미지만 되돌리고 경고를 남긴다. 새 형식으로 한 번 성공하면 기록이 바뀐다.

### 2. Compose는 runner 홈의 릴리스 디렉터리에서 실행하고, 롤백은 직전 성공 릴리스 디렉터리로 실행한다

- 배포 job은 체크아웃한 뒤 배포에 쓰는 infra 파일을 `~/.jarihana/backend-<env>-releases/<config_sha>/`
  아래에 같은 상대 경로로 복사한다. 대상은 워크플로 `paths`의 infra 항목과 같다(Compose 파일,
  `infra/monitoring/alloy/config.alloy`, `infra/scripts/verify-backend.sh`). 같은 이름의 디렉터리가
  이미 있으면 덮어쓰지 않는다. 한 번 만든 릴리스 디렉터리는 바꾸지 않는다.
- Compose 해석 검증, Alloy 검증, 교체, 배포 후 점검은 작업 디렉터리가 아니라 이 릴리스 디렉터리의
  파일로 실행한다. Compose 파일의 `name:`(`jarihana-dev`, `jarihana-prod`)이 프로젝트를 정하므로
  디렉터리가 바뀌어도 같은 컨테이너와 `alloy-data` 볼륨을 관리한다.
- 롤백 여부는 태그가 아니라 릴리스, 곧 `image_digest`와 `config_sha`의 쌍으로 판단한다. 직전 기록이
  있고, 교체 단계를 지났고, 둘 중 하나라도 이번 배포와 다르면 롤백한다. 둘 다 같으면 같은 릴리스를 다시
  실행하는 것이므로 건너뛴다.
- 롤백은 다음 순서로 한다.
  1. 직전 기록의 digest로 이미지를 확보한다. 로컬에 없으면 `<이미지>@<digest>`로 받는다.
  2. 그 이미지에 `backend_tag`로 로컬 태그를 다시 붙인다. 같은 이름의 로컬 태그가 다른 digest를
     가리키고 있어도 점검한 이미지로 고정된다.
  3. 직전 기록의 `release_dir`에 있는 Compose 파일로 `up -d --no-build --force-recreate backend alloy`를
     실행한다.
  4. 같은 디렉터리의 점검 스크립트와 Alloy readiness로 복구를 확인한 뒤 workflow를 실패로 끝낸다.
- 직전 기록의 릴리스 디렉터리가 없으면(옛 형식 기록, 수동 정리 등) 지금처럼 현재 체크아웃의 설정으로
  이미지만 되돌리고 경고를 남긴다.
- 릴리스 디렉터리는 "오래된 Backend 이미지 정리" 단계에서 함께 정리한다. 최근 5개와 직전 성공 기록이
  가리키는 디렉터리는 남긴다. 보존 개수는 팀 합의 항목이다.

### 3. 교체 전에 Compose 설정을 해석해 본다

- 교체 단계 전에 `docker compose -f <릴리스 디렉터리의 Compose 파일> config --quiet`를 실행한다. 문법
  오류와 `${이름:?}`로 요구한 값의 누락이 교체 전에 드러나므로, 기존 컨테이너를 지우지 않고 멈춘다.
- `config`의 출력에는 실행 값이 펼쳐지므로 `--quiet` 없이 로그에 남기지 않는다.
- 이 검증은 컨테이너가 기동한 뒤에야 드러나는 오류(잘못된 포트, 메모리 제한, 값의 내용)는 잡지 못한다.
  그 경우는 결정 2의 롤백이 맡는다.

### 4. Compose가 요구하는 실행 값의 이름은 두 번의 배포에 걸쳐 바꾼다

- 롤백은 Compose 파일을 되돌리지만 job `env`와 GitHub Environment 값은 되돌리지 못한다. Compose가
  `${이름:?}`로 요구하는 값의 이름을 바꾸거나 지우면서 옛 이름을 같은 배포에서 job `env`에서도
  없애면, 직전 릴리스의 Compose가 해석에 실패해 롤백이 깨진다.
- 그래서 이름을 바꾸거나 지울 때는 먼저 새 이름을 추가하고 옛 이름을 job `env`에 남긴 채 한 번 성공
  배포한다. 옛 이름은 다음 배포에서 지운다.
- Environment 값의 내용을 바꿀 때는 바꾼 이름과 시점을 PR이나 이슈에 남긴다. 값이 잘못되어 실패하면
  롤백으로는 복구되지 않으므로, 실패 보고에서 최근 값 변경을 먼저 확인할 수 있게 한다.

### 5. dev 점검을 통과한 digest에 GitHub 호스팅 runner가 검증 태그를 붙인다

- dev 배포 job은 이미지를 태그 대신 build job이 출력한 digest로 받고, 점검을 통과하면 실행한 digest를
  job 출력으로 내보낸다. dev 배포 job의 권한은 지금처럼 `packages: read`다.
- dev 워크플로에 승격 job을 새로 둔다. 이 job은 GitHub 호스팅 runner에서 dev 배포 job이 성공했을 때만
  실행하고, `packages: write`만 받는다. Environment를 붙이지 않으므로 실행 값 시크릿이 들어가지 않는다.
- 승격 job은 dev 배포 job이 보고한 digest가 build job이 push한 digest와 같은지 확인한다. build를 건너뛴
  수동 재배포라면 GHCR에서 조회한 `image_tag`의 digest와 비교한다. 같을 때만 그 digest에
  `dev-verified-tree-<backend 트리 해시>` 태그를 레지스트리에서 붙인다. 이미지를 다시 push하지 않는다.
- 트리 해시는 build job 출력에서 받는다. 수동 재배포에서도 트리를 알 수 있도록 build job은 이미지에
  트리 해시 라벨을 함께 남긴다. 라벨이 없는 옛 이미지는 승격하지 않는다.
- 검증 태그는 "dev에서 `verify-backend.sh`의 readiness 대기와 스모크 테스트를 통과했다"는 뜻이다.
  기능 검증이나 QA 통과를 뜻하지 않는다.

### 6. prod는 검증 태그의 digest만 자동 배포한다

- push로 실행된 prod 배포는 `dev-verified-tree-<main의 backend 트리 해시>`를 받는다. 태그를 한 번
  digest로 바꾼 뒤에는 그 digest만 쓰고, 성공 기록(결정 1)에도 digest를 남긴다.
- 검증 태그가 없으면 교체 전에 실패로 끝낸다. 이때 `tree-<해시>` 태그가 있는지 함께 보고 메시지를
  나눈다.
  - `tree-` 태그도 없다: develop을 거치지 않은 backend 코드다(지금과 같다).
  - `tree-` 태그만 있다: dev 배포가 점검에 실패했거나 아직 진행 중이다. dev 배포와 승격이 성공한 뒤
    prod 실행을 다시 실행한다.
- `BACKEND_TAG`(`APP_VERSION`)는 지금처럼 이미지의 revision 라벨에서 정한다.
- `image_tag`를 넣은 수동 실행은 사람이 고른 버전을 다시 배포하는 비상 경로이므로 검증 태그 없이도
  허용하고, 그 digest가 검증 태그의 digest와 같은지를 경고로 남긴다. 이 처리는 팀 합의 항목이다.
- prod 배포 job의 권한은 지금처럼 `contents: read`, `packages: read`다.

## 문제 1의 선택지

| 선택지 | 방식 | 추가 권한 | 장점 | 단점 |
| --- | --- | --- | --- | --- |
| 1A. 현행 유지 | 이미지 태그만 되돌리고 설정 장애는 revert PR로 복구한다 | 없음 | 바꿀 것이 없다 | 설정 장애에서는 서비스가 중단된 채 남는다. prod Compose만 바뀐 릴리스는 롤백을 시도하지 않는다 |
| 1B. 설정 커밋 SHA만 기록 | 성공 기록에 digest와 `GITHUB_SHA`를 남기고, 롤백 때 `git fetch`로 그 커밋의 infra 파일을 꺼내 실행한다 | 없음(`contents: read`로 fetch) | 서버에 남는 것이 기록 파일 하나다 | 롤백 순간 GitHub에서 커밋을 받아야 한다. 꺼낸 `config.alloy`를 Alloy가 bind mount하므로 결국 지워지지 않는 위치가 필요하다. 성공한 배포는 여전히 작업 디렉터리를 bind mount한다 |
| 1C. 릴리스 디렉터리(제안) | 배포마다 infra 파일을 runner 홈에 복사해 그곳에서 실행하고, 롤백은 직전 성공 디렉터리로 실행한다 | 없음 | 롤백에 네트워크가 필요 없다. 실행 중인 컨테이너가 다음 체크아웃에 덮어쓰이지 않는 파일을 가리킨다 | runner 홈에 작은 디렉터리가 쌓여 정리가 필요하다. 서버를 새로 만들면 기록과 함께 사라진다 |
| 1D. 설정 묶음을 GHCR에 올림 | infra 파일을 OCI 아티팩트로 만들어 이미지처럼 digest로 관리한다 | 설정을 올리는 job에 `packages: write` | 서버를 새로 만들어도 이력이 남는다 | prod 설정은 main에서 오므로 main 쪽에도 쓰기 권한 job이 필요하다. 도구와 경로가 늘어나는 데 비해 롤백 효과는 1C와 같다 |
| 1E. 교체 전 검증 강화 | `compose config`로 교체 전에 더 많이 거른다 | 없음 | 기존 컨테이너를 지우기 전에 멈춘다 | 기동 뒤에야 드러나는 오류는 못 잡는다. 단독으로는 부족해 1C와 함께 쓴다(결정 3) |

## 문제 1의 실패 시나리오

"복구"는 자동 롤백 뒤 점검을 다시 통과하는 것을 뜻한다. 제안은 1C와 1E를 함께 쓰는 경우다.

| 시나리오 | 지금 | 1B | 1C와 1E(제안) |
| --- | --- | --- | --- |
| 새 이미지의 코드 결함으로 health가 UP이 되지 않는다 | 복구(2026-10-12 확인) | 복구 | 복구 |
| Compose 변경 결함(포트, 메모리 제한, 값 이름)이 이미지 변경과 함께 배포된다 | 이전 이미지도 새 Compose로 실행되어 롤백 점검이 실패하고 중단된다 | 복구 | 복구 |
| prod에서 `infra/docker-compose.yml`만 바뀐 릴리스가 실패한다 | 태그가 같아 롤백을 건너뛰고 중단된다 | 복구 | 복구 |
| Alloy 설정이 `alloy validate`는 통과하지만 기동 뒤 준비 상태가 되지 않는다 | 같은 설정으로 롤백해 실패하고 중단된다 | 복구 | 복구 |
| Compose 해석이 실패한다(필수 값 누락, 문법 오류) | 교체 단계에서 실패해 컨테이너는 그대로지만, 롤백도 같은 이유로 실패해 결과를 읽기 어렵다 | 이전 설정으로 불필요하게 재생성한다(짧은 중단) | 결정 3이 교체 전에 멈추고 기존 컨테이너를 유지한다 |
| GitHub Environment 값의 내용이 잘못되었다(예: DB 비밀번호) | 복구 불가, 중단 | 복구 불가, 중단 | 복구 불가, 중단. 값을 고친 뒤 다시 실행한다 |
| Compose가 요구하는 실행 값의 이름을 바꾸며 옛 이름을 한 번에 지웠다 | 해당 없음(롤백도 새 Compose를 쓴다) | 옛 Compose 해석이 실패해 롤백도 실패한다 | 같다. 결정 4의 규칙으로 막는다 |
| 점검 스크립트 변경 결함으로 정상 앱을 실패로 판정한다 | 롤백 뒤에도 같은 스크립트로 실패 판정한다 | 옛 스크립트로 복구를 확인하고, 이번 배포는 실패로 남는다 | 같다 |
| 워크플로 파일 자체의 결함 | 복구 불가(롤백 절차가 그 파일에 있다) | 같다 | 같다 |
| 롤백 순간 GitHub 연결이 불안정하다 | 로컬에 이미지가 있으면 복구 | 커밋을 받지 못하면 설정을 되돌리지 못한다 | 로컬 파일이라 영향이 없다 |
| 교체 전에 실패한 배포 뒤 Alloy가 재시작한다(메모리 제한 256 MiB, 호스트 재부팅) | 작업 디렉터리에 남은 새 설정을 읽을 수 있다(아래 참고) | 같다 | 실행 중인 컨테이너가 성공한 릴리스 디렉터리를 가리켜 영향이 없다 |
| 직전 기록이 없다(첫 배포, 서버 재생성) | 롤백하지 않는다 | 같다 | 같다 |
| 직전 기록이 옛 형식이다 | 해당 없음 | 이미지만 되돌린다 | 이미지만 되돌린다(전환 직후 한 번) |

Alloy 재시작 항목: 단일 파일 bind mount는 컨테이너가 시작될 때마다 원본 경로를 다시 연결한다. 지금은
원본이 runner 작업 디렉터리라서, 이미지 받기나 Alloy 검증처럼 교체 전 단계에서 실패한 배포가 체크아웃해
둔 새 `config.alloy`를 다음 재시작 때 실행 중이던 Alloy가 읽을 수 있다. 구현할 때 dev에서 재현해
확인한다.

## 문제 2의 선택지

| 선택지 | 방식 | 필요한 권한 | 장점 | 단점 |
| --- | --- | --- | --- | --- |
| 2A. 현행 유지 | prod가 `tree-` 태그의 존재만 확인한다 | 변화 없음 | 바꿀 것이 없다 | dev에서 실패한 이미지도 prod로 간다. 사람의 릴리스 병합만이 관문이다 |
| 2B. dev 배포 job이 검증 태그를 붙임 | 점검 통과 뒤 dev EC2 runner가 GHCR에 태그를 붙인다 | dev 배포 job(dev EC2)에 `packages: write` | job 하나로 끝난다 | dev EC2 runner가 prod가 받을 태그를 쓸 수 있게 되어 dev 서버 침해가 곧 prod 코드 실행으로 이어진다. 태그 실패가 배포 실패로 보인다 |
| 2C. 호스팅 runner의 승격 job(제안) | dev 배포 성공 뒤 GitHub 호스팅 runner job이 digest를 대조하고 태그를 붙인다 | 새 승격 job에 `packages: write`. dev EC2와 prod 배포 job은 지금처럼 read | GHCR 쓰기 권한이 지금처럼 GitHub 호스팅 runner에만 있다. 승격 실패만 따로 다시 실행할 수 있다 | job이 하나 늘고 호스팅 runner 대기 시간(수십 초)이 더해진다 |
| 2D. GitHub API로 dev 배포 결과 조회 | prod가 revision 라벨의 커밋 SHA로 dev Environment 배포 기록이나 dev 워크플로 실행 결과를 조회한다 | prod 배포 job에 `deployments: read` 또는 `actions: read` | GHCR 쓰기 권한이 늘지 않는다 | 기록이 digest가 아니라 커밋 SHA 기준이다. 재빌드로 `tree-` 태그가 옮겨지거나 수동 재배포가 develop HEAD로 기록되면 결과와 이미지가 어긋난다. API 페이지 처리와 진행 중 상태 해석이 필요하다 |
| 2E. 증명(attestation) | dev 통과를 서명된 증명으로 남기고 prod가 검증한다 | dev 쪽 `id-token: write`, `attestations: write`, prod 쪽 검증 도구 | 위조에 가장 강하다 | 공개 저장소라 서명이 공개 투명성 로그에 남는다. 팀 규모에 비해 도구와 개념이 무겁다 |
| 2F. prod Environment 승인 규칙 | prod 배포 전에 사람이 dev 결과를 보고 승인한다 | 저장소 관리자의 Environment 설정 변경 | 워크플로 변경이 거의 없다 | 확인이 사람에게 남고 digest 대조가 없다. 배포마다 승인 대기가 생긴다 |

## 문제 2의 실패 시나리오

| 시나리오 | 2A(지금) | 2B | 2C(제안) | 2D |
| --- | --- | --- | --- | --- |
| dev 점검에 실패한 이미지의 코드가 릴리스 병합된다 | prod에 배포된다(prod 점검이 실패하면 롤백) | 교체 전에 멈춘다 | 교체 전에 멈춘다 | 교체 전에 멈춘다 |
| dev 배포가 끝나기 전에 릴리스 병합된다 | 점검 전 이미지가 배포된다 | 멈춘다. dev 성공 뒤 prod를 다시 실행한다 | 같다 | 진행 중 상태를 실패로 볼지 기다릴지 정해야 한다 |
| infra만 바뀐 develop 병합으로 같은 트리가 재빌드되고 dev 점검이 실패한다 | 점검에 실패한 새 digest가 배포된다 | 마지막으로 통과한 digest가 배포된다 | 같다 | revision 라벨이 실패한 커밋을 가리켜, 이미지 문제가 아니어도 멈춘다 |
| dev 점검 통과 뒤 태그 붙이기가 실패한다(GHCR 장애) | 해당 없음 | 서비스는 정상인데 dev 배포 job이 실패로 표시된다 | 승격 job만 실패한다. 실패한 job 다시 실행으로 복구한다 | 해당 없음 |
| dev EC2 runner가 침해된다 | 읽기 권한뿐이라 GHCR에 영향이 없다 | 임의 이미지를 검증 태그로 올려 prod에서 실행시킬 수 있다 | 쓰기 권한이 없다. 점검 결과를 속여 build job이 만든 미검증 이미지를 승격시킬 수는 있다 | 점검 결과를 속여 미검증 이미지를 통과시킬 수 있다 |
| 검증 태그를 붙인 뒤 dev에서 기능 결함이 발견된다 | 해당 없음 | 태그를 취소할 마땅한 수단이 없다(GHCR은 버전 단위로 지운다). 릴리스 병합을 미룬다 | 같다 | 같다 |
| 검증 digest가 GHCR 정리로 지워진다 | 해당 없음 | prod가 멈추고 그 digest로의 롤백도 실패한다 | 같다. 정리 기준에서 검증 태그와 직전 성공 digest를 뺀다 | 해당 없음 |

## 선택 이유

문제 1에 1C와 1E를 고른 이유는 다음과 같다.

- **점검을 통과한 조합을 그대로 되살린다:** 롤백이 직전에 점검을 통과한 이미지 digest와 설정 파일을
  함께 다시 실행한다. 이미지만 맞추고 설정은 새것을 쓰는 지금의 어긋남이 사라진다.
- **롤백 순간에 외부 의존이 늘지 않는다:** 1B는 장애 대응 중에 GitHub에서 커밋을 받아야 하지만, 1C는
  서버에 있는 파일만 쓴다.
- **실행 중인 설정이 고정된다:** 컨테이너의 bind mount가 다음 체크아웃에 덮어쓰이는 작업 디렉터리 대신
  바뀌지 않는 릴리스 디렉터리를 가리킨다. 1B로는 이 문제가 남는다.
- **새 권한과 설정이 필요 없다:** runner 홈의 기존 기록 위치를 그대로 쓰고, GitHub 권한이나 Environment
  설정을 바꾸지 않는다.

문제 2에 2C를 고른 이유는 다음과 같다.

- **쓰기 권한의 위치가 바뀌지 않는다:** [백엔드 ADR 0016](0016-github-hosted-build-and-ghcr.md)처럼
  GHCR에 쓰는 것은 GitHub 호스팅 runner뿐이고 서버의 runner는 읽기만 한다.
  [백엔드 ADR 0009](0009-aws-deployment-topology.md)가 감수한 runner 침해 위험이 dev에서 prod로 번지지
  않는다.
- **prod가 받는 것이 dev가 실행한 digest 그 자체다:** 태그의 존재나 커밋 SHA가 아니라 digest로 dev와
  prod가 이어진다. 재빌드로 `tree-` 태그가 옮겨져도 영향이 없다.
- **승격 실패가 배포 실패와 분리된다:** 레지스트리 장애로 태그를 못 붙여도 dev 배포 결과는 그대로이고,
  승격 job만 다시 실행하면 된다.
- **prod 쪽 변경이 작다:** prod 배포 job의 권한과 Environment 설정은 그대로이고, 받는 태그 이름만 바뀐다.

## 제약과 전제

- 워크플로는 develop과 main에서만 실행되므로 병합 전에는 실제 배포로 확인할 수 없다(백엔드 ADR 0016과
  같다). 롤백 절차를 스크립트로 옮겨 로컬 Docker에서 실패 시나리오를 재현할지는 구현할 때 정한다.
- 레지스트리에서 태그만 붙이는 명령(예: `docker buildx imagetools create`, `crane tag`)이 digest를 그대로
  유지하는지 구현할 때 확인한다. 유지되지 않는 명령은 쓰지 않는다.
- dev와 prod의 Compose 파일은 별개다. `config.alloy`는 두 환경이 같은 파일을 쓰므로 dev에서 먼저
  실행되지만, `infra/docker-compose.yml`의 변경은 dev에서 실행되지 않는다. 검증 태그는 이미지를
  보증할 뿐 prod 설정을 보증하지 않는다.
- 롤백은 이미 적용한 Flyway 마이그레이션을 되돌리지 않는다. 스키마 호환은
  [Flyway baseline 운영 문서](../operations/flyway-baseline.md)의 규칙을 따른다.
- 기록과 릴리스 디렉터리는 서버에만 있어, 서버를 새로 만들면 첫 배포는 되돌릴 곳이 없다(백엔드 ADR
  0016과 같다).
- 새 GitHub Variables, Secrets, Environment 설정은 필요 없다.

## 결과

### 긍정적인 결과

- 설정 변경 때문에 실패한 배포도 직전 성공 릴리스로 자동 복구된다.
- prod에서 Compose 파일만 바뀐 릴리스도 롤백 대상이 된다.
- prod에는 dev 점검을 통과한 digest만 자동 배포된다. 백엔드 ADR 0016 결정 5가 감수한 비용이 사라진다.
- 성공 기록과 롤백이 digest 기준이라, 태그가 옮겨져도 점검한 이미지로 되돌아간다.
- 실행 중인 Alloy가 읽는 설정 파일이 성공한 릴리스에 고정된다.

### 감수하는 비용

- 워크플로 단계가 늘고 dev 워크플로에 job이 하나 늘어난다. prod 릴리스는 dev 배포와 승격이 끝나야
  진행된다.
- runner 홈에 릴리스 디렉터리가 쌓여 정리 규칙이 필요하다.
- 실행 값(Variables, Secrets)의 결함은 여전히 자동 복구되지 않는다. Compose가 요구하는 값의 이름
  변경은 두 번의 배포로 나눠야 한다.
- 검증 태그는 스모크 테스트 통과만 뜻하고, 한 번 붙인 태그를 취소할 마땅한 수단이 없다.
- 이 변경 전에 만든 이미지에는 검증 태그와 트리 해시 라벨이 없다. 바뀐 prod 워크플로가 처음 실행되기
  전에 같은 backend 트리로 dev 배포와 승격이 한 번 성공해야 한다.

## 팀 합의가 필요한 항목

1. 릴리스 디렉터리 보존 개수. 제안은 최근 5개와 직전 성공 릴리스다.
2. prod 수동 실행(`image_tag`)에서도 검증 태그를 요구할지. 제안은 요구하지 않고 경고만 남기는 것이다.
   요구하면 이 변경 전에 만든 이미지로는 수동 복구할 수 없다.
3. 검증 태그 이름. 제안은 `dev-verified-tree-<트리 해시>`다.
4. 결정 4의 실행 값 이름 변경 규칙을 팀 컨벤션에 넣을지, 넣는다면 어느 문서에 둘지.
5. Environment 값 변경을 어떻게 남길지. PR이나 이슈에 남기는 것 외에, 워크플로가 실행 값의 이름별
   설정 여부를 로그로 남기는 방안도 있다. Secrets의 해시를 서버나 로그에 남기는 방안은 제안하지 않는다.
6. 설정 장애 롤백을 dev에서 시연할지. 시연하려면 일부러 깨진 설정을 develop에 병합해야 한다.

## 후속 작업

- 이 ADR이 채택되면 같은 작업 브랜치에서 구현한다.
  1. dev 워크플로: build job의 digest와 트리 해시 출력, 트리 해시 라벨, deploy job의 digest 받기와
     릴리스 디렉터리, `compose config` 검증, 새 기록 형식과 롤백 조건, 승격 job
  2. prod 워크플로: 검증 태그로 이미지 정하기, 릴리스 디렉터리, `compose config` 검증, 새 기록 형식과
     롤백 조건
  3. [백엔드 ADR 0016](0016-github-hosted-build-and-ghcr.md)의 결정 4, 결정 5와 "적용하지 않는 범위"에
     이 ADR을 연결하고 백엔드 ADR 목록의 대체 관계를 고친다.
  4. runner 안내와 운영 문서에 기록 파일 형식, 릴리스 디렉터리 위치, 수동 복구 절차를 적는다.
- 구현 확인: 병합 뒤 dev push 배포와 승격 job이 성공하는지, GHCR의 검증 태그 digest가 dev에서 실행한
  digest와 같은지, 첫 prod 릴리스의 이미지 선택 로그를 확인한다. 설정 장애 롤백은 합의한 방법으로
  시연한다.
- 백엔드 ADR 0016 후속 작업의 GHCR 정리 기준에 검증 태그와 각 서버의 직전 성공 digest를 보존 대상으로
  넣는다.
- 배포 결과 알림(백엔드 ADR 0016 후속 작업)에 롤백 여부와 되돌린 릴리스(digest, 설정 커밋)를 함께
  보낸다.
- `infra/docker-compose.yml` 변경이 dev에서 실행되지 않는 공백은, 두 Compose 파일의 차이를 CI에서
  비교하는 방안으로 따로 검토한다.

## 적용하지 않는 범위

이 결정은 다음을 의미하지 않는다.

- GitHub Environment의 Variables와 Secrets를 이전 값으로 되돌릴 수 있다.
- 롤백이 데이터베이스 스키마를 되돌린다.
- 워크플로 파일 자체의 결함을 롤백으로 복구한다.
- 검증 태그가 있는 이미지는 기능 검증이나 QA를 통과했다.
- 교체와 롤백 동안의 짧은 중단이 사라진다.
