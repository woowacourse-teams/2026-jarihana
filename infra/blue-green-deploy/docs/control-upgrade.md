# 고정 배포 제어 버전 교체

앱 Compose만 변경하고 [배포 계약](deployment.md#운영-백엔드의-compose-선택)을 유지하는 경우에는 이 절차가 필요 없다.
최초 Compose 검증기 v2 적용, 제어 코드나 watchdog 자체 변경에는 이 절차를 사용한다.
자동 제어 태그 교체와 root 업그레이드 helper는 제공하지 않는다.

배포 검사 코드는 앱 이미지와 별도로 고정된다. `BLUE_GREEN_CONTROL_REF`만 바꾸면 기존
완료 저널의 control SHA와 topology digest가 달라 다음 plan이 차단된다. 기존 태그를 이동하거나
저널의 SHA/digest를 고치지 않고, 관리자가 확인한 정확한 완료 기록에 한해 다음 plan을 허용한다.

이 절차는 **동일한 서버 구성에서 control 버전만 교체**할 때 사용한다. EC2 교체, 주소 변경,
미해결 작업, owner/boot 불일치에는 적용하지 않는다. 해당 경우 [수동 조사](recovery.md#수동-조사)가 필요하다.
이관 검사를 포함한 코드가 사람의 승인을 받아 병합된 뒤에만 운영 설치와 pin 변경을 수행한다.

## 교체 전 확인과 보존

1. `BLUE_GREEN_PROD_ENABLED=false`로 새 운영 배포를 막고, 실행 중이거나 대기 중인 배포가
   없는지 확인한다. 완료되지 않은 배포를 버전 교체로 복구하려고 하지 않는다.
2. 세 호스트의 Actions runner와 coordinator watchdog timer를 유지보수 동안 정지한다.
   실행 중인 job/oneshot이 없음을 먼저 확인한다. 앱, Nginx와 Alloy는 계속 실행한다.
3. GitHub 실제 실행과 coordinator 저널을 대조한다. `COMPLETE`는 sealed 또는 최초 bootstrap
   완료여야 한다. `ROLLED_BACK`은 HTTP/worker 복구가 완료되고 변경한 프론트도 복구돼야 한다.
   pending, cleanup_deferred 또는 앱의 미해결 worker/stop intent가 있으면 중단한다.
4. Nginx probe의 슬롯/예상 upstream/실제 upstream과 API 성공을 확인한다. A/B의 관리 API를
   각 호스트 loopback에서 읽어 현재 boot, 이미지와 DB authority를 대조한다. 서비스 슬롯은
   ACTIVE worker, COMPLETE authority와 동일 owner여야 하고, 다른 슬롯은 PAUSED/unresolved=0이어야 한다.
   토큰은 curl stdin 설정으로 전달하며 출력하지 않는다. 보관된 receipt만으로 실제 worker 상태를 단정하지 않는다.
5. 보호된 설정, 원본 저널과 앱 intent, S3 state/ETag와 manifest를 보호된 위치에 보관한다.
   아래 이관 허가와 별개로 서비스 복구에 필요한 원본을 보존한다.

## 새 릴리스와 이관 허가 준비

새 `refs/tags/deployment-control-*` 태그는 승인된 커밋에 한 번만 만들고 기존 태그를 이동하지 않는다.
새 control checkout은 root 소유의 별도 release 디렉터리에 두고 태그와 40자리 SHA를 대조한다.
앱 호스트의 설치 Compose는 초기 구성과 비릴리스 경로의 기준 파일로 유지한다.
일반 운영 prepare에서 사용하는 Compose 원본은 앱 배포 커밋이며 이 설치본과의 byte 일치를 요구하지 않는다.

coordinator의 기존 설정을 별도 보호 파일에 보관하고, 그 파일을 `previous-config.json`이라고 한다.
원본 저널을 바꾸지 않고 아래 필드를 **새 coordinator.json**에 추가한다. `previous_topology`에는
보관한 기존 설정의 `.topology` 전체를 그대로 넣는다. `target_control`은 새 설정의 `.topology.control`과 같아야 한다.

```json
{
  "control_transition": {
    "schema_version": 1,
    "previous_topology": "기존 설정의 topology 객체로 교체",
    "target_control": {
      "ref": "refs/tags/deployment-control-새버전",
      "sha": "새 릴리스의 40자리 SHA"
    },
    "journal_sha256": "원본 state.json의 SHA-256",
    "active_slot": "A",
    "issued_at": 0,
    "expires_at": 0
  }
}
```

이 예시는 직접 설치할 설정이 아니다. `active_slot`은 실제 probe와 worker 소유권을 확인한 값,
시각은 Unix 초로 채운다. 유효기간은 발급 후 최대 3600초이며 미래 발급 시각은 5초까지만 허용한다.
교체 중 배포 기록이나 실제 경로가 바뀌면 허가를 새로 만들기 전에 그 원인을 조사한다.

원본 저널을 coordinator 계정 소유 0600의 다음 경로에도 동일한 바이트로 복사한다.
디렉터리는 기존 저널과 같은 0700 디렉터리다. 기존 백업이 있으면 덮어쓰지 말고 소유자,
권한과 내용 일치를 확인한다. 심볼릭 링크를 허용하지 않는다.

```text
/var/lib/jarihana-deploy/prod/state.json.control-<journal_sha256>
```

새 설정의 `.topology`는 기존 `.topology`에서 `control.ref/sha`만 바꾼다.
이관 검사는 control을 제외한 topology 전체의 동일성과 이전 topology digest를 확인한다.
다른 서버 ID나 주소 변경을 이 허가에 함께 넣을 수 없다.

## 설치와 재개

1. 세 호스트의 보호된 설정에 새 `topology.control.ref/sha`를 설치한다. `control_transition`은
   coordinator 설정에만 추가한다. root 소유와 기존 runner/coordinator 읽기 그룹 및 0640 권한을 유지한다.
2. 필요한 초기 Compose 설치본을 갱신하고 watchdog drop-in의 `ExecStart`와 `WorkingDirectory`를
   모두 새 release로 맞춘다. 작업 디렉터리가 더 오래된 SHA를 가리키는 경우도 별도로 확인한다.
   앱과 Nginx를 재시작하지 않는다. `systemctl daemon-reload` 후 실제 ExecStart와 WorkingDirectory를 대조한다.
3. coordinator 계정으로 새 checkout의 `bg_config`, `bg_previous_journal`을 실행해 이관 허가와
   백업/원본 일치, 실제 HTTP 슬롯을 검증한다. 이 검사는 저널, worker와 S3 상태를 변경하지 않는다.
   이 단계에서 실패하면 새 배포를 계속 차단하고 보관한 설정과 watchdog 경로로 복구한다.
4. GitHub `BLUE_GREEN_CONTROL_REF`를 새 태그로 맞춘다. 세 호스트 설정, 설치본, watchdog,
   GitHub pin을 다시 대조하고 runner와 watchdog timer를 재개한 뒤 prod 배포를 활성화한다.
5. 승인된 main 배포 PR을 머지하고 새로운 실행을 추적한다. 새 plan은 백업된 기존 저널을
   검증한 뒤 평소와 같이 새 배포 저널을 생성한다. 새 저널의 control SHA/topology digest와
   API/worker 관찰, 실제 경로, 프론트 상태 및 배포 완료를 확인한다.

3단계의 읽기 전용 검사는 관리자 Bash에서 다음과 같이 실행한다. `NEW_CONTROL_DIR`와
`NEW_CONTROL_SHA`는 앞에서 태그와 대조한 실제 값이다. 일반 배포로 이어받으며 bootstrap은 거부한다.

```bash
runuser -u jarihana-coordinator -- bash -c '
  source "$1/infra/blue-green-deploy/scripts/actions/coordinator.sh"
  ENVIRONMENT=prod
  BG_MODE=deploy
  CONTROL_SHA=$2
  STATE_FILE=/var/lib/jarihana-deploy/prod/state.json
  bg_config /etc/jarihana-deploy/prod/coordinator.json
  bg_previous_journal
' _ "$NEW_CONTROL_DIR" "$NEW_CONTROL_SHA"
```

이관 허가는 원본 저널의 전체 해시에 묶여 있다. 새 plan이 저널을 교체하면 같은 허가로
다른 저널을 채택할 수 없다. 다음 유지보수에서 불필요해진 `control_transition`을 제거하되
원본 저널 백업은 보존한다. 이미 새 배포가 시작됐다면 이전 pin/저널을 복원하지 말고 현재
실행의 [장애 복구](recovery.md)를 따른다. 이전 control로 되돌리는 것 역시 별도 이관이다.
