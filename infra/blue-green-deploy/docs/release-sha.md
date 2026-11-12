# 배포 실행 SHA 사용과 최초 전환

운영 배포는 main push 또는 main의 수동 실행이 시작된 커밋 SHA 하나를 사용한다.
앱 실행기, coordinator, queue guardian, Nginx 템플릿과 앱 Compose가 모두 같은 원본이다.
다음 main 머지로 배포가 실행되면 새 실행의 SHA를 자동으로 사용한다. 실행 도중 추가 머지가 들어와도
이미 시작한 배포의 버전은 바뀌지 않는다. 제어태그나 자동 태그 교체 기능은 사용하지 않는다.

자동 배포는 `BLUE_GREEN_PROD_ENABLED=true`이고 [운영 workflow](../../../.github/workflows/backend-prod-deploy.yml)의
`paths`에 해당하는 파일이 변경된 main push에서 실행한다. 앱 Compose 변경은 이 경로에 포함된다.
모든 main 머지가 배포를 실행하는 것은 아니며, frontend-only 배포는 기존 백엔드 컨테이너와 Compose를 유지한다.
백엔드 이미지는 별도로 선택한 digest에 고정한다. Compose만 바꾼 배포는 이전 이미지 digest를 재사용할 수 있다.

## 서버에 남는 설정

서버 설정은 저장소 신원, 환경, EC2/host ID, upstream, 포트, 보호된 경로와 관찰 기준을 가진다.
배포 버전은 GitHub run과 저널의 `sha`로 확인한다. 새 코드 SHA를 서버 설정에 넣는 작업은 없다.
완료된 저널에서 다음 SHA로 진행할 수 있지만, 미완료 배포와 달라진 호스트 topology는 차단한다.

watchdog과 중앙 수집기는 Actions와 독립된 설치형 도구다. watchdog은 저널 만료를 감지해
`NEEDS_ATTENTION`을 기록하며 컨테이너를 만들거나 Compose를 읽지 않는다. 이 도구의 설치본은
관리자가 갱신하지만, 일반 배포 때마다 같은 SHA로 맞출 필요는 없다.

## 기존 운영 환경의 최초 전환

이 절차는 **이번 변경을 main에 머지하기 전**, 진행 중인 배포가 없는 유지보수 시간에 수행한다.
main 머지와 수동 workflow 실행을 잠시 보류한다는 뜻이며, 서비스 중인 앱 컨테이너나 Nginx를
중지하지 않는다. 저장소의 코드 변경만으로 서버 전환을 수행하지 않는다.

`topology.control`을 삭제하면 전체 topology의 해시가 바뀐다. 아래 도구는 기존 설정과 완료 기록이
먼저 일치하는지 검사한 다음, 설정에서는 `topology.control`과 옛 `control_transition`만 제거하고
저널에서는 `topology_digest`만 새 설정에 맞춘 **복사본**을 만든다. 이미지, 슬롯, 완료 상태와 receipt는
보존한다. 과거 저널의 `control_sha`는 과거 실행 기록으로 남아도 새 코드가 사용하지 않는다.
일반 배포 코드의 topology 비교를 느슨하게 만들거나 미완료 배포를 성공으로 바꾸지 않는다.

### 1. 동시 실행 중단과 원본 확보

1. 진행 중인 배포/롤백과 수동 관리 작업이 없는지 확인한다. coordinator에서 watchdog과 수집기
   timer를 멈추고 이미 실행 중인 service가 끝났는지 확인한다. 배포 잠금과 수집기 잠금을 다른
   프로세스가 잡고 있으면 전환하지 않는다. timer만 멈춰도 실행 중인 service가 끝나는 것은 아니다.
2. 실제 HTTP 슬롯, 앱 이미지와 worker owner가 마지막 완료 기록과 일치하는지
   [상태 확인](status.md#실제-실행과-저널)으로 대조한다. `NEEDS_ATTENTION`, pending, 미완료 정리 또는
   복구가 있으면 [수동 조사](recovery.md#수동-조사)로 먼저 해결한다.
3. 각 호스트에서 설정 원본과 소유자/그룹/모드, coordinator의 저널과 앱 intent, S3 pointer/manifest,
   watchdog/수집기 설치 파일과 systemd 설정을 보호된 경로에 백업한다. A/B 중 한 EC2가 중지돼 있다면
   그 호스트 설정을 읽고 교체할 수 있는 별도 유지보수 접근을 먼저 준비해야 한다. 이 도구는 EC2를
   시작하지 않으며, 이전 스냅샷을 현재 설정이라고 가정하지 않는다.

coordinator에서 timer 중단과 현재 실행 여부를 확인하는 명령은 다음과 같다. 서비스가 `activating` 또는
`active`이면 완료를 기다리고, 실패 상태이면 원인을 조사한다. 아래 상태는 앱 서비스의 상태가 아니다.

```bash
systemctl stop jarihana-deploy-watchdog@prod.timer jarihana-observability@prod.timer
systemctl show --no-pager jarihana-deploy-watchdog@prod.service jarihana-observability@prod.service \
  -p ActiveState -p SubState -p ExecMainStatus
```

두 service가 실행 중이지 않음을 확인한 뒤 같은 coordinator 관리자 Bash에서 기존 잠금 파일을 열고
잠금을 유지한다. 잠금을 얻지 못하면 진행하지 않는다. 새 root 소유 잠금 파일을 만들지 않는다.

```bash
set -e
test -f /var/lib/jarihana-deploy/prod/state.json.lock
test ! -L /var/lib/jarihana-deploy/prod/state.json.lock
test -f /var/lib/jarihana-observability/prod/collector.lock
test ! -L /var/lib/jarihana-observability/prod/collector.lock
exec 8<>/var/lib/jarihana-deploy/prod/state.json.lock
flock -n 8
exec 7<>/var/lib/jarihana-observability/prod/collector.lock
flock -n 7
```

검토된 이 PR 소스가 있는 Linux 관리자 환경에 다음 네 **현재 파일의 복사본**을 모은다.
스냅샷 디렉터리는 root 소유 0700, 파일은 root 소유 0600으로 제한하며 저장소나 CI artifact에 올리지 않는다.
실제 파일을 복사할 때마다 해당 호스트에 원본 백업도 남긴다. 설정 수집/전달은 기존의 승인된 관리 연결을 사용한다.

| 스냅샷 이름 | 원본 호스트와 경로 |
| --- | --- |
| `coordinator.json` | coordinator의 `/etc/jarihana-deploy/prod/coordinator.json` |
| `app-A.json` | A의 `/etc/jarihana-deploy/prod/app-A.json` |
| `app-B.json` | B의 `/etc/jarihana-deploy/prod/app-B.json` |
| `state.json` | coordinator의 `/var/lib/jarihana-deploy/prod/state.json` |

### 2. 변경본 생성과 검증

`SNAPSHOT_DIR`에는 위 네 복사본만 준비하고, `PREPARED_DIR`는 아직 존재하지 않는 경로로 선택한다.
`SETUP_DIR`는 [설치용 소스 준비](server-setup/README.md#설치용-소스-준비)로 확보한 checkout이다.
이번 일회성 전환은 main 병합 전이므로 `SETUP_SHA`에 **리뷰가 완료된 이 PR의 40자리 커밋 SHA**를 사용한다.
움직이는 브랜치 이름이나 아직 검토하지 않은 후속 커밋을 사용하지 않는다. 전환 도구, watchdog과 수집기
수정이 포함된 원본인지 확인한다. 일반 신규 서버 설치에서 main 커밋을 쓰는 원칙과 이 최초 전환을 구분한다.

```bash
SNAPSHOT_DIR=/root/jarihana-control-removal/snapshot
PREPARED_DIR=/root/jarihana-control-removal/prepared
bash "$SETUP_DIR/infra/blue-green-deploy/scripts/prepare-control-removal.sh" \
  "$SNAPSHOT_DIR" "$PREPARED_DIR"
(cd "$PREPARED_DIR/before" && sha256sum --check SHA256SUMS)
(cd "$PREPARED_DIR/after" && sha256sum --check SHA256SUMS)
cat "$PREPARED_DIR/transition.txt"
```

도구는 기존 설정 검사, A/B 역할과 세 호스트 topology/저장소 일치, 기존 저널의 설정 해시와 완료 조건을
검사한다. `COMPLETE`는 sealed 또는 bootstrap이어야 하고, `ROLLED_BACK`은 HTTP/worker 및 변경된
프론트 복구가 끝나야 한다. 생성 후에도 현재 `bg_previous_journal`로 새 해시를 검증한다.
실제 HTTP 경로와 DB worker owner 확인은 위 운영 확인이 담당한다. 이 오프라인 도구가 대신 확인하지 않는다.
생성이 실패하면 입력은 그대로이며 적용 가능한 출력 디렉터리를 남기지 않는다.

### 3. 서버 적용과 설치형 도구 갱신

타이머와 새 배포는 계속 중단한 상태에서 진행한다. watchdog과 수집기를 새 설정 형식에 대응하는
검토된 소스로 먼저 준비한다. watchdog은 [설치 절차](server-setup/coordinator.md#watchdog-설치), 수집기는
[기존 설치본 갱신](../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md#기존-설치본의-제어태그-제거-대응)을 따른다.
수집기는 앱 Compose 배포로 자동 갱신되지 않는다.

각 호스트에 **그 호스트에 필요한 before/after 파일만** 보호된 경로로 전달한다. 아래 함수는 각 호스트의
관리자 Bash에서 사용한다. `before`가 해당 호스트의 현재 파일과 같을 때만 교체하며 현재 소유자/그룹/모드를 유지한다.
동시 작업이 없다는 조건은 이 함수 실행 중에도 유지해야 한다. 여러 호스트의 파일을 한 번에 원자적으로 바꾸는 절차는 아니다.

```bash
replace_checked() {
  local live=$1 before=$2 after=$3 temporary
  [[ -f $live && ! -L $live && -f $before && ! -L $before && -f $after && ! -L $after ]] || return 1
  cmp -s "$live" "$before" || return 1
  temporary=$(mktemp "$(dirname "$live")/.control-removal.XXXXXX") || return 1
  if ! install -o "$(stat -c %u "$live")" -g "$(stat -c %g "$live")" \
      -m "$(stat -c %a "$live")" "$after" "$temporary" || ! cmp -s "$live" "$before"; then
    rm -f -- "$temporary"
    return 1
  fi
  mv -f -- "$temporary" "$live"
}
```

검증된 `after` 파일의 해시를 원래 준비한 `after/SHA256SUMS`와 대조한 뒤, A에서 `app-A.json`, B에서
`app-B.json`, coordinator에서 `coordinator.json`, 마지막으로 `state.json` 순서로 교체한다.
아래는 coordinator에 해당 파일을 같은 `PREPARED_DIR` 구조로 전달한 경우다. A/B도 같은 함수에
각 호스트의 실제 설정 경로와 해당 `before/after` 파일을 전달한다. 오류가 나면 뒤 명령을 실행하지 않는다.

```bash
set -e
replace_checked /etc/jarihana-deploy/prod/coordinator.json \
  "$PREPARED_DIR/before/coordinator.json" "$PREPARED_DIR/after/coordinator.json"
replace_checked /var/lib/jarihana-deploy/prod/state.json \
  "$PREPARED_DIR/before/state.json" "$PREPARED_DIR/after/state.json"
```

watchdog의 새 `watchdog.conf`를 설치하고 `systemctl daemon-reload` 후 `ExecStart`와 `WorkingDirectory`가
의도한 `SETUP_DIR`인지 확인한다. 그다음 백업한 옛
`/etc/systemd/system/jarihana-deploy-watchdog@prod.service.d/control-release.conf`를 제거하고 다시 reload/확인한다.
watchdog이 계속 참조하는 `SETUP_DIR`와 그 안의 스크립트는 삭제하지 않는다.

### 4. 검증 후 main 머지

세 서버의 실제 설정을 준비한 `after` 파일과 대조하고, coordinator에서 다음 읽기 전용 검사를 수행한다.

```bash
sudo -u jarihana-coordinator bash -c '
  source "$1/infra/blue-green-deploy/scripts/actions/coordinator.sh"
  bg_config /etc/jarihana-deploy/prod/coordinator.json
  ENVIRONMENT=prod
  STATE_FILE=/var/lib/jarihana-deploy/prod/state.json
  bg_previous_journal
' _ "$SETUP_DIR"
systemctl show --no-pager jarihana-deploy-watchdog@prod.service \
  -p ExecStart -p WorkingDirectory -p DropInPaths
```

위 검사가 성공하면 coordinator 관리자 Bash의 잠금을 해제한다. main 머지와 수동 배포는 아직 보류한다.

```bash
flock -u 7
exec 7>&-
flock -u 8
exec 8>&-
```

watchdog과 수집기를 수동으로 한 번 실행해 성공 및 실제 수집값을 확인한 뒤 timer를 재개한다.
설정/기록 일치, HTTP 경로와 worker owner, 수집 최신성까지 확인한 뒤에만 이번 변경을 main에 머지한다.
이 머지로 새 배포가 시작되며, checkout/prepare SHA와 최종 완료를 확인한다. 실패한 실행은 재실행하지 않는다.
`BLUE_GREEN_CONTROL_REF`는 새 코드가 읽지 않으므로 전환 후 GitHub 변수에서 정리할 수 있다.

어느 호스트에서든 설치/검증에 실패하면 **main 머지와 배포를 재개하지 않는다.** 아직 새 배포가 시작되지 않았고
상태가 백업 이후 변경되지 않았는지 확인한 뒤, 이번 작업이 바꾼 모든 설정/저널 및 watchdog/수집기 설치본을
각 호스트의 백업으로 함께 복원한다. 부분 적용 상태에서 해시만 강제로 맞추거나 완료 상태를 바꾸지 않는다.
4단계에서 잠금을 해제했거나 timer를 재개한 뒤라면, 먼저 두 timer를 멈추고 실행 중인 service가 끝났는지
확인한 다음 1단계의 두 잠금을 다시 확보한다. 잠금을 이미 유지 중이면 같은 잠금을 사용한다.
잠금 확보와 현재 상태 대조를 마친 뒤에만 복원하며, 복원한 설정/기록/설치본의 일치를 확인하기 전에는 timer를 재개하지 않는다.
새 배포가 이미 실행됐다면 과거 저널로 덮어쓰지 말고 [수동 조사](recovery.md#수동-조사)를 따른다.

이후 Compose나 배포 스크립트를 변경하는 일반 배포에는 위 유지보수를 반복하지 않는다.
호스트 교체나 상태 형식 변경은 별도 운영 변경이며, 소스 SHA가 달라지는 것과 구분한다.

## 롤백

배포 확정 전 자동 롤백은 남아 있는 이전 컨테이너로 HTTP와 worker를 돌린다.
이전 Compose를 새 설정과 섞거나 컨테이너를 재생성하지 않는다.
컨테이너가 없어 재구성해야 하는 경우에는 해당 앱을 만든 배포 SHA의 Compose와 당시 이미지
digest를 사용하며 [장애 복구](recovery.md)를 따른다.
