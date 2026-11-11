# 운영 제어 버전 자동 교체

최초 설치를 마친 뒤에는 `main`의 Production Release가 앱 배포 전에 제어 버전을 선택한다.
`BLUE_GREEN_CONTROL_REF`는 개발 환경과 최초 bootstrap의 입력으로 남고, 일반 운영 배포는
coordinator의 보호된 `topology.control`을 기준으로 선택한 태그를 모든 job에 전달한다.
GitHub 관리자 토큰이나 변수 쓰기 권한은 사용하지 않는다.

## 교체 조건과 순서

현재 설치된 SHA와 배포할 main SHA 사이에서 다음 경로를 비교한다.

- `infra/blue-green-deploy/scripts/**`, `control/**`, `nginx/**`
- `infra/blue-green-deploy/controller/**`
- `controller/app-compose.yml`은 설치된 버전의 `release-compose.sh` 허용 목록을 제외하고 비교한다.
  현재 허용된 정확한 `POINTS_STARTS_AT` 선택 매핑만 달라지면 제어 버전을 교체하지 않는다.

앱 코드만 바뀌면 기존 태그를 재사용한다. 제어 코드나 보호된 Compose 내용이 바뀌면
`refs/tags/deployment-control-prod-<main의 40자리 SHA>`를 만든다. 같은 태그가 이미 있으면
대상 SHA가 일치할 때만 재사용하며, 기존 태그를 이동하거나 삭제하지 않는다.

1. 기존 운영 배포와 관제 작업이 사용하는 concurrency 안에서 태그를 선택한다.
   Production Release 부모가 제어 교체와 앱 배포 전체에 공유 잠금을 유지한다.
   개발 배포는 기존 공통 workflow의 잠금을 사용하며 태그 쓰기 권한을 요구하지 않는다.
2. coordinator의 보호된 설정에 등록된 A/B EC2를 시작한다. 대기 컨테이너는 시작하지 않는다.
   부모의 hosted queue guardian이 runner 대기를 300초로 제한하고 `production-result`까지 감시한다.
3. 세 호스트의 root helper가 GitHub API로 main 운영 실행의 저장소 ID, SHA, 이벤트와 첫 실행을
   확인하고, 고정 저장소의 태그를 root 소유 release 디렉터리로 받는다.
4. 완료 저널, 실제 HTTP 경로, 활성 앱의 boot/이미지/worker 소유권, 앱 intent를 대조한다.
   중지된 대기 앱은 현재 Docker 종료 정보가 보관된 stop intent와 정확히 같아야 한다.
   원본 설정, 저널, Compose, 앱 상태, helper와 S3 포인터/manifest를 보관한다.
5. A/B의 Compose와 제어 pin을 먼저 설치한다. coordinator에는 원본 저널의 해시에 묶인
   최대 1시간의 `control_transition`을 설치하고 watchdog 경로를 교체한다.
6. 기존 이관 검사를 새 코드로 통과한 뒤 helper 자체도 같은 프로토콜의 새 버전으로 교체하고
   watchdog을 재개한다. 선택한 태그로 평소 Blue-Green 배포를 진행한다.

설정만 교체하는 단계는 앱, Nginx를 재시작하거나 DB worker 권한을 바꾸지 않는다.
새 Compose는 뒤따르는 후보 앱 준비에서 사용한다. 실제 HTTP/worker 전환과 관찰은 기존
Blue-Green 절차가 담당한다.

## 최초 한 번 설치

이 변경은 main의 승인된 배포 코드에 세 호스트의 제어 설치 권한을 준다. 고위험 PR의 사람
승인을 받은 후, 해당 코드를 main에 반영하기 전에 관리자 SSH로 각 서버에 helper를 설치한다.
기존 root 소유 control release와 보호 설정을 유지한 상태에서 설치할 수 있다.

검토한 커밋을 root 소유의 별도 checkout으로 받고 SHA를 확인한 뒤, 그 checkout에서 실행한다.
아래 `<검토한-커밋-checkout>`은 실제 root 소유 절대 경로로 바꾼다.

```sh
# coordinator
sudo bash <검토한-커밋-checkout>/infra/blue-green-deploy/control/install.sh jarihana-coordinator
# 앱 A와 B 각각
sudo bash <검토한-커밋-checkout>/infra/blue-green-deploy/control/install.sh jarihana-runner
```

설치 결과는 `/usr/local/sbin/jarihana-control-upgrade`와
`/etc/sudoers.d/jarihana-control-upgrade`다. helper는 checkout 경로나 명령 문자열을 입력받지
않으며 `operation`, run ID, SHA만 받는다. 인증 토큰은 stdin으로 전달한다.
세 runner에 helper가 설치된 것을 확인한 후 main에 반영한다. helper가 없으면 자동 교체는
배포 전에 실패한다. `BLUE_GREEN_PROD_ENABLED=false`는 계속 새 운영 배포를 차단한다.

호스트에는 Bash 5, Git, jq, coreutils, curl, Docker, AWS CLI와 systemd가 필요하다.
coordinator의 EC2 시작 권한과 S3 읽기 권한, 공개 저장소와 GitHub API 접근을 사용한다.
`BLUE_GREEN_PROD_A_RUNNER`, `BLUE_GREEN_PROD_B_RUNNER`는 서로 다른 전용 runner label이어야 한다.

## 실패와 재개

교체 실패 시 원래 설정/Compose/helper/watchdog을 복구하고 앱 배포를 차단한다.
이미 배포 저널이 진행된 경우에는 이전 설정 복구를 거부한다. 취소나 runner 단절로 복구 job도
실행하지 못하면 자동 복구를 보장하지 않는다. 두 EC2를 보존하고 다음 위치를 조사한다.

```text
/var/backups/jarihana-control/automatic/<run-id>/
/var/lib/jarihana-deploy/prod/state.json
/var/lib/jarihana-deploy/prod/state.json.control-<원본-해시>
```

태그 교체가 성공한 뒤 이미지 조회나 프론트 빌드가 실패해 plan에 도달하지 못할 수 있다.
다음 **새 실행**은 세 호스트를 다시 검증하고, 원본 저널/백업/이전 topology가 그대로인 경우에만
이관 허가를 갱신한다. 실패한 실행의 Re-run은 허용하지 않는다.
일부 호스트에 새 pin이 남은 경우 topology 대조가 배포를 차단하므로 [수동 복구](control-upgrade.md)가 필요하다.

서버 ID/주소, 계정 권한, secret 값, 설정 스키마와 helper 프로토콜 변경은 자동으로 추측하거나
설치하지 않는다. 동일한 topology에서 제어 코드와 Compose를 교체하는 절차다.
`UPGRADE_PROTOCOL`이 바뀌는 비호환 helper 변경에는 관리자 설치가 다시 필요하다.
태그 생성 권한은 Production Release의 해당 job에만 부여하며, main의 사람 리뷰와 보호 규칙을 유지한다.
