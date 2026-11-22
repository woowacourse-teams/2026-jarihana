# 아지트 도면 전환

API 두 개와 공용 realtime은 [도면 목록](../../../backend/src/main/resources/contracts/clubhouse/blueprints/index.json)의 버전별 파일을 같은 빌드 입력으로 사용한다. 모임에 저장된 배치, 버전 참조와 revision, DB에서 선택하는 기본 버전, 가구 카탈로그는 그대로 사용한다.

## 파일을 읽는 이미지 배포

1. 개발·운영 DB에 V45, V46, V47을 적용한 상태에서 아래 사전 검사를 각각 실행한다. V47 적용이 필요하면 현재 서비스와 호환되는 백엔드로 일반 Flyway 배포를 먼저 완료한다. 검사에서 불일치가 나오면 표시된 버전의 DB 값과 파일을 대조해 기존 값을 보존한 뒤 배포를 다시 준비한다.
2. 파일을 읽는 개발·운영 API를 배포한다. 운영 프론트 게시를 미뤄야 하면 [Production Release](../../blue-green-deploy/docs/deployment.md)에서 `backend_only=true`를 사용한다. 이 구간에는 기존 API와 realtime이 사용할 DB payload가 남아 있다.
3. 두 DB와 연결되는 파일 기반 [공용 realtime 후보를 배포한다](../../realtime/README.md). 공개 `GET /ws/realtime`이 두 Origin에서 모두 통과한 뒤 프론트를 게시한다. 개발·운영 각각에서 기존 모임에 다시 입장하고, 새 모임을 만들어 선택한 가구 배치를 조회·편집할 수 있는지 확인한다.

저장소 루트에서 `psql` 접속 옵션 또는 libpq의 `PG*` 환경 변수로 대상을 지정한다. 아래의 `PGSERVICE`는 대상에 해당하는 로컬 서비스 항목이다. 검사 계정에는 관련 테이블 조회와 임시 테이블 생성 권한이 필요하다.

```sh
PGSERVICE=jarihana_dev bash infra/database/clubhouse-blueprints/migrate.sh check
PGSERVICE=jarihana_prod bash infra/database/clubhouse-blueprints/migrate.sh check
```

검사는 DB에 발행한 도면 키와 기본 버전 참조를 모두 확인한다. 기존 payload가 있으면 구조, 시작 위치, 기본 배치도 대응하는 파일과 JSONB 값으로 비교한다. 새 도면은 두 앱이 새 파일을 읽을 수 있게 배포한 다음 DB에 키를 등록한다. 발행한 파일을 수정하거나 지우는 변경은 PR 검사에서 실패한다.

## 기존 payload 삭제

이 단계는 DB 담당자가 배포가 끝난 뒤 별도로 실행하는 전진 이관이다. 앱 기동과 Flyway는 기존 V45–V47을 원래대로 적용한다.

1. 세 서비스의 배포와 복구 조작을 멈춘다. 개발의 실제 앱과 마지막 성공 태그, 운영의 [배포 저널과 활성 슬롯](../../blue-green-deploy/docs/status.md), 공용 realtime의 실제 컨테이너와 마지막 성공 이미지를 확인한다. 운영은 이전 앱이 종료되고 저널이 확정된 상태여야 한다. 세 서비스에서 실행 중인 이미지와 복구에 쓸 이미지가 모두 이번 도면 목록을 읽으며, 기존 DB payload를 읽는 컨테이너나 배포 작업이 모두 종료됐는지 확인한다.
2. 두 DB의 복구 지점을 기록한다. 아래 형식의 JSON에 확인 시각(UTC)과 실제 운영 중인 이미지 및 복구용 이미지의 digest를 각각 기록한다. `blueprintsSha256`는 작업에 사용하는 소스에서 `bash infra/database/clubhouse-blueprints/migrate.sh digest`로 얻는다. 이 값은 버전 목록과 목록에 있는 모든 파일의 SHA-256을 함께 검증한다.

   ```json
   {
     "observedAt": "2026-11-22T12:34:56Z",
     "blueprintsSha256": "<digest 명령 결과 64자리>",
     "legacyReadersStopped": true,
     "deploymentsPaused": true,
     "active": {"devApi": "sha256:<64자리>", "prodApi": "sha256:<64자리>", "realtime": "sha256:<64자리>"},
     "rollback": {"devApi": "sha256:<64자리>", "prodApi": "sha256:<64자리>", "realtime": "sha256:<64자리>"}
   }
   ```

3. 변경 권한이 있는 계정으로 개발 DB부터 전환한다. 전환은 15분 이내의 확인 기록과 정확한 DB 이름을 요구한다. 잠금을 잡은 뒤 사전 검사와 같은 비교를 거쳐 `space_blueprint.geometry_schema_version`, `space_blueprint.geometry`, `space_blueprint_runtime`을 한 트랜잭션에서 삭제한다. 불일치나 잠금 시간 초과가 발생하면 전환은 커밋되지 않는다.

   ```sh
   PGSERVICE=jarihana_dev bash infra/database/clubhouse-blueprints/migrate.sh contract dev topology.json
   PGSERVICE=jarihana_dev bash infra/database/clubhouse-blueprints/migrate.sh check
   ```

4. 개발의 기존 모임 입장, 새 모임 생성 및 저장, WebSocket 재접속을 확인한다. 두 환경의 배포 상태를 다시 확인해 기록을 갱신한 뒤 운영 DB에도 같은 순서로 적용한다.

   ```sh
   PGSERVICE=jarihana_prod bash infra/database/clubhouse-blueprints/migrate.sh contract prod topology.json
   PGSERVICE=jarihana_prod bash infra/database/clubhouse-blueprints/migrate.sh check
   ```

삭제 후 API와 realtime은 기록에 남긴 파일 기반 이미지부터 복구할 수 있다. 삭제 전의 데이터가 필요하면 별도 DB로 시점 복구한다. 기존 바이너리까지 실행해야 하는 경우 별도 DB에서 기존 payload 구조와 값을 검증한 뒤 승인된 후속 이관으로 복원한다. 모임 배치 저장을 유지하려면 live DB 전체를 삭제 전 시점으로 되돌리지 않는다.
