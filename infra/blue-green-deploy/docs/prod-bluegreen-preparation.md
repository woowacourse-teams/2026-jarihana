# prod Stage 1 준비

이 PR은 prod 프론트 배포의 runner 선택과 공유 잠금, 최초 전환 절차를 준비한다.
기존 prod runner를 기본값으로 유지하며, 이 PR을 반영하는 것만으로 Blue-Green이 켜지지는 않는다.
EC2·IAM·runner 라벨·GitHub Variables/Secrets·CloudFront·DB·앱·watchdog의 실제 변경과
bootstrap/deploy는 아래 조건을 확인한 뒤 승인된 적용 범위에서 별도로 진행한다.
운영 관리 접속과 읽기 전용 점검은 SSM을 사용한다. 기존 앱→coordinator의 내부 읽기 전용
SSH grant 조회는 관리 접속과 별개인 기존 제어 계약이며 이 준비에서 변경하지 않는다.

## 재사용 범위와 준비 결과

`backend-prod-deploy.yml`에는 이미 main push와 `BLUE_GREEN_PROD_ENABLED=true`의
자동 Blue-Green 경로가 있다. `backend-bluegreen-deploy.yml`의 기존 controller·worker
인계·관찰·롤백을 재사용한다. 새 controller나 prod 전용 orchestration을 만들지 않는다.
호스트 설치 계약은 [공통 설치 기준](../controller/full-deployment.md)을 따른다.

`frontend-prod-deploy.yml`은 hosted build를 유지하고 S3 업로드 job만 기존 EC2 IAM으로
실행한다. `FRONTEND_PROD_DEPLOY_RUNNER`가 없으면 기존 `jarihana-prod`를 사용한다.
향후 양쪽 앱 runner를 검증한 뒤 이 repository 변수를 `jarihana-frontend-prod-deploy`로
설정한다. Blue-Green A/B 전용 라벨과 FE 공통 라벨은 서로 다른 용도다. 공통 라벨을
Nginx·dev runner에 부여하지 않는다. dev PR #467의 변경/병합은 이 준비에 포함하지 않는다.

FE deploy job만 `jarihana-observed-deployment` 그룹에 참여해 Blue-Green 전체 및
monitoring 배포와 직렬화한다. 업로드 도중 해당 EC2가 자동 중지되는 것을 막으며 build는
이 잠금을 점유하지 않는다. 기존 FE workflow concurrency도 유지한다.
`cancel-in-progress: false`, `queue: max`를 사용한다. 이미 이전 workflow로 queued인
실행에는 새 라벨/잠금이 소급되지 않으므로 실제 적용 전에 상태를 따로 확인한다.
S3 sync는 원자적 배포가 아니므로 진행 중 업로드를 취소하거나 호스트를 중지하지 않는다.

기존 AWS CLI v2가 있으면 그대로 사용한다. 없으면 Linux ARM64에서만 공식 AWS CLI
2.38.5를 고정 SHA256으로 확인해 `RUNNER_TEMP`에 설치하고 `GITHUB_PATH`에 추가한다.
설치 코드/해시는 [dev runner 준비 PR #467](https://github.com/woowacourse-teams/2026-jarihana/pull/467)의
`c670b538`을 재사용한다. 새 장기 AWS 키·OIDC·sudo 설치를 추가하지 않는다.
후보 호스트에서 아키텍처, CLI, curl/unzip/sha256sum과 임시 디렉터리 쓰기 권한을 실제 확인한다.
ARM64가 아니면서 CLI가 없는 호스트는 공통 라벨을 활성화하지 않는다.

## 실제 적용 전 통과해야 할 게이트

1. **공유 B 반환:** prod2를 사용하던 dev Blue-Green을 해제하고 기존 dev를 복구한다.
   [dev 해제 순서](../controller/dev-automatic-deployment.md#실패-시와-prod-이관)에 따라 dev A의
   HTTP/worker 복귀, 기존 dev 앱·runner 복구, 실제 dev API 확인, 모든 관련 실행 종료를
   먼저 검증한다. dev flag를 false로 유지하고 B의 dev 앱·라벨·설정·watchdog을 정리한다.
   dev/prod 동시 활성화는 금지한다. flag만 false로 바꾸거나 B를 강제로 중지하지 않는다.
   기존 해제 문서만으로 독립 teardown 명령이 제공되지는 않는다. 실제 관리 API 단계와
   terminal 저널/control pin 조정·복구 명령을 별도로 검토하기 전에는 반환 실행 준비도 미완료다.
2. **보호된 실설정:** prod A/B/Nginx의 instance ID·private IP·IAM role·VPC·SG·포트·
   컨테이너·HOST_ID·관측 라벨·DB endpoint를 재조회한다. JSON 예시는 placeholder이므로
   실값으로 검토한 보호된 호스트 설정을 별도로 준비한다. root 소유 prod 경로와 prod
   저널을 사용하며 dev 저널을 복사/삭제하지 않는다. 토큰·키·host snapshot은 저장소에 넣지 않는다.
   동일한 immutable control ref/SHA와 byte 일치 Compose를 Nginx/A/B/watchdog에 준비한다.
3. **runner와 IAM:** `BLUE_GREEN_PROD_A_RUNNER`/`BLUE_GREEN_PROD_B_RUNNER`는 실제
   해당 한 호스트에만 붙은 서로 다른 라벨이어야 한다. 준비 검증 시 두 runner 모두 온라인이고 EC2
   신원이 일치하는지 확인한다. FE 공통 라벨은 두 앱 runner의 기존 EC2 IAM으로 prod S3
   head/sync/delete/PWA 메타데이터 권한을 확인한 뒤에만 부여하고 FE 변수를 설정한다.
   Nginx 역할의 Describe 및 해당 prod A/B 한정 Start/Stop 권한도 실제 확인한다.
   앱·runner·관측 수집기가 함께 실행될 때의 RAM 여유도 확인한다. CLI 다운로드·압축 해제·
   설치는 디스크의 `RUNNER_TEMP`에서 수행하고, 메모리 파일시스템에 대용량 임시 파일을 만들지 않는다.
4. **DB 동시 연결 예산:** 승인된 읽기 전용 경로로 `max_connections`, reserved connection
   설정과 `pg_stat_activity`의 환경/사용자/애플리케이션별 연결을 측정한다. 실제 JVM의
   Hikari 최대 풀, 앱의 별도 HTTP/worker 풀과 다른 서비스/모니터링 연결도 확인한다.
   `prod A 최대 + prod B 최대 + 복구된 dev 최대 + 기타 피크 + 운영 여유`가 예약 연결을
   제외한 DB 한도 이내인지 확인한다. 현재 연결 수만으로 피크를 대신하지 않는다.
   미확인 최대값은 0으로 계산하지 않는다. 예산이 부족하면 측정 근거로 별도 최소 설정을
   검토하며 임의로 풀을 25 등으로 변경하지 않는다. 수치가 없으면 이 게이트는 미완료다.
5. **최초 전환안 선택:** 아래의 HTTP 선전환 후보와 같은 호스트 재설치 대안은 아직
   채택/실행하지 않았다. DB 예산·dev 반환부터 통과하고, 실제 DB owner·세션/인증·HTTP
   연결/채팅 드레인·CloudFront 전파·rollback 명령을 구체화한 뒤 적용 영향을 승인한다.
   legacy 앱은 DB authority fencing으로 자동 보호되지 않는다. 기존 legacy worker와
   managed ACTIVE worker를 함께 실행하지 않는다. bootstrap은 기존 앱을 설치/교체하지 않는다.
6. **등록 후 자동화:** 선택한 초기 경로에 맞춰 bootstrap 전에 새 앱의 승인 digest,
   READY·PAUSED·inFlight/unresolved=0, DB UNASSIGNED, 실제 Nginx HTTP 대상과 반대 EC2
   stopped를 확인한다. 미해결 intent/pending이 없어야 하며 관측 query/grant 경로도 작동해야
   한다. 최초 bootstrap은 승인한 시간에 한 번 수행한다. 실제 인증·쓰기·이미지·푸시와
   CloudFront Deployed를 확인한 뒤 prod 자동화 flag를 켠다. 수동 실행에는 `deploy`를 명시한다.
   첫 교대와 역방향 교대, 관찰·정상 종료·EC2 중지를 실제 확인하기 전에는 검증 완료로
   기록하지 않는다. [관찰과 복구 계약](../controller/full-deployment.md#관찰과-복구)의 최소 300초 관찰,
   연속 실패/UNKNOWN 판정과 배포 확정 전 자동 롤백을 유지한다. 배포 확정 후 장애는 별도 복구 대상이며
   `cleanup_deferred`나 미확정 상태이면 양쪽 호스트를 보존한다.

## 초기 전환 권장 후보: prod2의 HTTP 선전환

HTTP 경로를 먼저 준비할 수 있는 후보로 **물리 prod2를 논리 A, 기존 물리 prod를 논리 B**로
매핑한다. 현재 dev에서 쓰는 A/B 명칭과 별개이며 아직 실제 매핑/설정 변경은 없다.
기존 [공통 bootstrap 설명](../controller/full-deployment.md#github-설정과-최초-초기화)의 A가 기존 prod
물리 호스트를 강제한다는 뜻은 아니다. `coordinator.sh`의 `bg_plan`은 실제 Nginx 대상에서
old slot을 읽고 반대 target EC2가 stopped인지 검사한다. `app.sh`의 bootstrap은 그 old
slot 앱의 drained·UNASSIGNED·승인 digest를 검사한 뒤 권한을 등록한다. 물리 호스트의
역할을 위처럼 정의하면 기존 엔진의 조건을 충족할 수 있다는 소스 검토 결과이며 실증은 아니다.

1. 공유 prod2의 dev 반환과 연결 예산을 먼저 통과한다. 보호된 prod topology·전용 라벨·
   HOST_ID·관리 포트·SSH 허가·관측 설정을 논리 슬롯에 맞춰 별도 준비한다. 기존 물리
   prod에는 legacy 앱을 유지한다. 새 논리 A(prod2)를 승인 digest와 기존 prod 업무 설정으로
   `PUSH_WORKER_CONTROL_ENABLED=true`, `PUSH_WORKER_START_PAUSED=true`로 준비하고 READY·
   PAUSED·inFlight/unresolved=0과 DB owner/스키마/세션 호환성을 검증한다. legacy 앱에 관리
   API가 없거나 응답이 거부된 것을 worker 종료/DB UNASSIGNED의 증거로 삼지 않는다.
2. Nginx를 새 논리 A HTTP로 준비하고 후보의 실제 인증·쓰기·이미지·채팅/연결 처리를
   확인한다. 기존 legacy worker만 발송을 맡고 새 managed worker는 계속 PAUSED다.
   최신 CloudFront 설정/ETag와 기존 origin·이미지·호스트 설정을 보호된 곳에 보관한 뒤
   **prod API Origin만** Nginx로 전환한다. behavior/cookie/cache/HTTPS/S3/이미지 계약을
   유지하고 Deployed·새 경로의 실제 요청 및 기존 HTTP/장기 연결의 드레인을 확인한다.
3. 기존 물리 prod(논리 B)에서 신규 선점을 중단하고 진행 발송·finish commit/DB 작업이
   끝난 것을 확인한 뒤 정상 종료한다. HTTP가 새 경로로 이동했다는 사실만으로 worker·
   DB 작업 0을 판단하지 않는다. legacy 세대의 container/image/boot·정상 종료·처리 완료
   증거와 설정을 보호된 곳에 보존한다. 상태를 판정할 수 없으면 중단한다. 이후 EC2 stopped를
   확인한다. 이 동안 새 worker는 PAUSED이므로 푸시 처리 지연이 생길 수 있다.
4. 실제 Nginx 대상 A, 새 A READY/PAUSED·drained, DB UNASSIGNED, B stopped 조건을
   다시 확인한 뒤 기존 bootstrap으로 새 A의 worker를 최초 등록한다. 실제 외부 효과와
   관측을 확인하고 자동화 flag를 켠다. 첫 A→B 이전에는 중지된 legacy B의 container와
   보존 증거를 검토해 명시적으로 정리/관리 모드 설치 준비를 마친다. 기존 `app_prepare`는
   이전 정상 종료 증거가 없는 stopped legacy 컨테이너를 자동 채택하지 않는다.

이 후보도 API 무중단을 보장하지 않는다. DB 연결 예산, 세션 호환, CloudFront 전파 중
동시 HTTP, STOMP/장기 연결 드레인과 legacy 작업 완료 판정은 실행 전에 해결해야 한다.
legacy 신규 선점 중단·정상 종료 명령과 실패 복구 payload도 별도 검토 전에는 미완료다.

같은 호스트 재설치는 fallback이다. 기존 물리 prod를 논리 A로 유지하려면 legacy 작업을
안전하게 종료하고 기존 앱을 내린 뒤 관리 모드 PAUSED 앱으로 교체해야 한다. bootstrap 전에
UNASSIGNED/drained와 B stopped를 확인한다. HTTP/푸시 중단 가능성과 영향 시간·복구 방법을
명시적으로 승인한 적용 시간에만 진행한다. 이 대안의 bootstrap 뒤에는 prod API Origin을
Nginx로 전환한다. 위 선전환 후보와 절차 순서를 혼용하지 않는다.

실패 시 flag만 false로 바꾸지 않는다. legacy 배포 재개 전 **기존 `jarihana-prod` backend
runner가 실제로 가리키는 물리 호스트**를 확인한다. legacy worker를 재개하기 전에 managed
worker의 안전한 drain/release를 먼저 확인하고 해당 물리 호스트로 HTTP/업무 처리를 복구한다.
선전환 후보에서는 그 호스트가 논리 B이므로 논리 A라는
이름만 보고 legacy 배포를 재개하지 않는다. 원상복구에 필요한 재기동·동일 세대/authority
검증 명령은 단계별로 별도 준비한다. Origin 복구에는 최신 CloudFront 설정/ETag를 사용하고
Deployed·실제 API를 확인한다. 판단 불가능한 worker/저널은 강제 초기화하지 않고 호스트를 보존한다.

현재 원격 조회가 실패했거나 확인하지 못한 값은 보호된 적용 기록에 미확인으로 남긴다.
SSM으로 확인하지 못한 항목, runner 온라인 표시 또는 기존 dev 성공만으로 prod 호스트·권한·DB 예산의
확인을 대체하지 않는다. 위 절차는 Stage 1에서 실행하지 않는다.
