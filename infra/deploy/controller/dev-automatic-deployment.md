# 실제 dev 도메인의 자동 Blue-Green 전환

코드 반영 후 실제 dev 도메인을 자동 배포로 전환하는 절차다. 최초 앱 교체에 일시 중단이
생길 수 있으므로 팀의 dev 사용과 develop 머지를 멈춘 적용 시간에 진행한다.

## 바뀌는 요청과 배포 경로

```text
현재: 사용자 → dev CloudFront → dev EC2(A)
전환: 사용자 → dev CloudFront → Nginx EC2 → 활성 dev 앱(A 또는 B)

develop의 배포 대상 변경 머지
  → route: BLUE_GREEN_DEV_ENABLED=true 확인
  → GitHub ARM runner에서 이미지 빌드
  → Nginx runner가 비활성 EC2 시작
  → 후보 앱 PAUSED 준비 → 기존 worker 반납 → HTTP 전환 → 후보 worker 활성화
  → 앱/HTTP 각각 15분 관찰 → 기존 요청 종료 → 기존 앱 정상 종료 → 기존 EC2 중지
```

배포 대상 변경은 `backend-dev-deploy.yml`의 push paths를 따른다. 프론트엔드만 바뀐 PR 등은
백엔드를 배포하지 않는다. CloudFront 변경은 이 최초 전환 때만 필요하다.
이후 A/B 교대는 Nginx의 private upstream만 바꾼다.

## 필요한 설정

A는 기존 dev EC2, B는 prod로 이관하기 전의 prod2다. 실제 인스턴스 ID·IP·컨테이너·포트는
호스트의 보호된 설정과 AWS에서 대조한다. 자동 할당 public IP/DNS는 stop/start 후 바뀔 수 있다.

root 소유 coordinator/app JSON은 [공통 설치 기준](full-deployment.md)에 따라 유지한다.
예시 JSON 전체로 기존 설정을 덮어쓰지 않는다. `nginx.container`·`nginx.probe_port`·
`topology`와 실제 컨테이너/EC2가 일치해야 한다. 앱과 Nginx는 private IP로 통신한다.

GitHub 설정은 다음과 같이 준비한다.

| 범위 | 변수 | 준비 값/의미 |
| --- | --- | --- |
| repository | `BLUE_GREEN_DEV_ENABLED` | 최초 코드 반영 때 false/미설정, 실제 전환 때 true |
| repository | `BLUE_GREEN_PROD_ENABLED` | dev 자동화 기간 false/미설정 |
| repository | `BLUE_GREEN_CONTROL_REF` | 이번 코드를 포함한 새 `refs/tags/deployment-control-*` |
| repository | `BLUE_GREEN_DEV_A_RUNNER`, `BLUE_GREEN_DEV_B_RUNNER` | 해당 EC2 한 대에만 붙은 서로 다른 전용 라벨 |
| dev environment | `RDS_URL`, `BLUE_GREEN_RDS_URL` | 둘 다 승인한 개발 RDS endpoint. JDBC 접두사·DB 이름을 붙이지 않음 |
| dev environment | `DB_USERNAME` | 기존 dev 계정 `jarihana_dev` |
| dev environment | `PUSH_ENABLED`, `PUSH_WORKER_ENABLED` | 기존 dev처럼 실제 발송을 유지할 때 둘 다 true |

비밀번호·JWT·OAuth·VAPID·이미지 서명 비밀값은 기존 dev Secrets로 전달한다. prod 값을
복사하지 않는다. 앱 Compose가 `jarihana_dev` DB 이름과 TLS JDBC URL을 구성한다.
`BLUE_GREEN_RDS_URL`은 현재 필수 검사 때문에 남긴 임시 변수다. dev 전용 자동화 제거 시
workflow·Bash의 소비 코드와 함께 정리하고, 이 값만 먼저 삭제하지 않는다.

활성화 변수는 repository 한 곳에서 관리하고 dev/prod environment에 같은 이름으로 등록하지
않는다. 둘 다 true이면 배포가 실패한다. prod가 활성화됐으면 dev의 수동 Blue-Green도 거부한다.
이 검사는 진행 중 배포를 회수하지 않으므로 설정을 바꾸기 전에 모든 관련 실행을 끝낸다.

## 적용 순서

1. **코드부터 반영한다.** dev flag가 false/미설정인지 확인하고 develop PR을 머지한다.
   기존 dev 배포와 이미지 빌드 성공을 확인한다. 이 머지 자체는 실제 경로를 바꾸지 않는다.
2. **배포가 없는 전환 시간을 확보한다.** 팀의 dev 사용과 develop 머지를 잠시 멈추고,
   기존 legacy/BG/모니터링 배포와 queue guardian의 queued/in_progress 실행이 모두 없는지 확인한다.
   새 control checkout을 교체하기 전에 dev watchdog timer를 멈추고 실행 중인 oneshot service도
   끝났는지 확인한다. prod timer·저널은 건드리지 않는다. 진행 중 실행에서 활성화 변수를
   바꾸지 않는다. 이전 이미지 digest·기존 A 실행 설정·CloudFront 설정/ETag를 보호된 위치에
   보관한다. 비밀값이 포함된 설정을 실행 로그나 PR에 붙이지 않는다.
3. **제어 코드를 갱신한다.** 리뷰한 커밋으로 새 immutable control tag를 만든다. 기존 태그는
   이동하지 않는다. GitHub `BLUE_GREEN_CONTROL_REF`, A/B/Nginx root JSON의 control ref/SHA,
   watchdog 코드 checkout을 같은 release로 맞춘다. 설치 Compose도 해당 release의 원본과
   byte 단위로 일치해야 한다. 이전 control tag를 그대로 쓰면 이번 푸시 설정 처리가 적용되지 않는다.
   기존 terminal 저널도 control SHA와 control ref/SHA를 포함한 topology digest에 묶인다.
   pin만 바꾸면 bootstrap의 plan이 거부되므로 아래의 명시적 기록 조정을 함께 준비한다.
4. **실제 경로를 준비한다.** Nginx는 A private app port를 가리킨다. 정지한 dev watchdog의
   설치 설정을 확인하고 Alloy·Prometheus 조회·A/B 전용 runner·읽기 전용 SSH 허가 조회가
   정상인지 확인한다. B는 stopped이며 기존 저널에 미해결 pending/ATTENTION이 없어야 한다.
   현재 DB 처리 권한은 검증된 조회로 확인하고, 아래 순서로 기존 owner 해소와 새 A의
   PAUSED/UNASSIGNED를 검증한다. legacy 앱의 관리 API 거부를 UNASSIGNED의 증거로 삼지 않는다.
   불일치는 원인을 확인한다. 저널 삭제나 임의 SQL 초기화로 통과시키지 않는다.
5. **A를 live dev 설정으로 최초 설치한다.** 교체 전에 기존 처리 권한을 확인한다. ACTIVE owner가
   있으면 반드시 그 owner 프로세스에서 검토된 관리 API 절차로 begin → HANDOFF → pause/drain →
   release → COMPLETE를 수행한다. 현재 boot·epoch·revision·기한을 대조하며 신규 boot가 이전
   owner의 권한을 강제로 반납하지 않는다. 상태를 확인하거나 안전하게 해소할 수 없으면 중단한다.
   기존 legacy 앱의 신규 작업을 중단하고 처리 중 작업을 마친 뒤 정상 종료한다.
   기존 dev Variables·Secrets와 승인 digest로 A를 제어 모드로
   설치한다. `PUSH_ENABLED=true`, `PUSH_WORKER_ENABLED=true`여도
   `PUSH_WORKER_CONTROL_ENABLED=true`, `PUSH_WORKER_START_PAUSED=true`여야 한다.
   loopback 관리 API의 READY·PAUSED·inFlight/unresolved=0과 실제 컨테이너의 푸시 설정을 확인한다.
   환경 전체를 출력하지 않고 필요한 비밀 아닌 항목만 비교한다. 기존 legacy 앱을 동시에
   실행하지 않는다. 이 최초 교체에는 일시 중단이 생길 수 있다.
   새 A에서 실제 상태를 확인한 뒤 [기존 dev terminal 기록 조정](#기존-dev-terminal-기록-조정)을
   수행한다. 새 release의 dev watchdog을 재개·확인한 뒤에만 다음 bootstrap으로 진행한다.
6. **최초 worker를 등록한다.** 새 develop 머지를 계속 막은 상태에서 dev flag를 true로 설정한다.
   `Backend Development Deploy`를 develop에서 수동 실행하고 `blue_green_mode=bootstrap`,
   `image_tag=<현재 A 이미지를 만든 40자리 SHA>`를 선택한다. 새 빌드를 생략하고 A의 처리 권한을
   최초 등록한다. A가 ACTIVE owner인지 확인한다. 이 작업은 A 설치를 대신하지 않으며,
   실패하면 자동 배포를 시작하지 않는다. bootstrap을 무작정 재실행하지 않는다.
7. **dev API Origin을 Nginx로 옮긴다.** 아래 CloudFront 항목을 확인해 한 origin만 수정한다.
   배포 상태가 Deployed가 되고 실제 `https://dev.jarihana.com/api/...` 호출이 Nginx를 통해
   A에 도달하는지 확인할 때까지 A를 유지한다. 정적 화면·이미지도 확인한다.
8. **실제 머지로 자동화를 확인한다.** 팀의 develop 머지를 재개하고 배포 대상 변경을 포함한
   PR을 머지한다. route가 blue-green/deploy이고 legacy job은 skipped인지 확인한다.
   실제 dev 도메인으로 요청을 지속하면서 A→B의 15분 관찰과 A 정상 종료·EC2 중지를 확인한다.
   다음 배포의 B→A도 확인한다. 별도 시험 주소의 성공만으로 이 단계를 완료 처리하지 않는다.

수동 배포가 필요하면 `blue_green_mode=deploy`와 승인 image_tag를 지정한다.
자동화 활성 중 기본값 `legacy`로 실행하면 명시적으로 실패한다.

## 기존 dev terminal 기록 조정

이 절은 새 A의 제어 모드 설치 확인 뒤, 최초 bootstrap 직전에 수행하는 관리자 조정 절차다.
이전 control release의 `/var/lib/jarihana-deploy/dev/state.json`이 남아 있으면 새 pin의 plan은
`Previous deployment requires reconciliation`로 거부한다. 단순히 phase가 terminal이거나
pending이 null이라는 이유로 파일을 지우거나 control SHA·topology 필드를 고치지 않는다.

1. step 2의 실행 중단과 dev watchdog timer/oneshot 종료를 재확인한다. 기존 release의 근거와
   대조해 저널이 schema 2·environment dev·phase COMPLETE 또는 ROLLED_BACK·pending null인지
   확인한다. ATTENTION·미확정 상태·cleanup_deferred·종료되지 않은 부모 run은 archive하지 않는다.
2. terminal 표시와 별도로 실제 Nginx가 A를 가리키고 A가 running/readiness UP인지 확인한다.
   **새 A의 관리 API**에서 worker PAUSED·inFlight/unresolved 0, HTTP/background drained,
   DB authority owner null·status UNASSIGNED·phase IDLE 또는 COMPLETE를 확인하고 B EC2가
   stopped인지 대조한다. ACTIVE owner는 step 5처럼 기존 owner를 교체하기 전에 해소해야 한다.
3. A/B의 `app-*/worker-intent.json`·`stop-intent.json`이 없거나 resolved=true이고 실제 프로세스·
   정상 종료 증거와 모순 없는지 확인한다. 미확정 intent는 먼저 해소하며 파일은 보존한다.
   B가 stopped라 증거를 확인할 수 없으면 이를 통과로 간주하지 않고 조정을 보류한다.
4. coordinator 계정으로 **기존 `state.json.lock` inode를 유지한 채 `flock -n`을 획득**한다.
   잠금 아래 `state.json`이 symlink가 아닌 정규 파일이며 coordinator 소유·0600인지 확인하고,
   위 JSON 조건과 실제 상태를 다시 대조한다. 원본 SHA256·이전 control ref/SHA·run/deployment를
   보호된 기록에 남긴다. 같은 dev 0700 디렉터리 안의 UTC 시각·run ID·이전 SHA를 포함한 새 고유
   archive 이름으로만, 기존 대상을 덮어쓰지 않는 동일 filesystem의 atomic rename을 수행한다.
   원본 owner/0600 유지·archive hash 일치·active `state.json` 부재를 확인하고 archive와 디렉터리를
   동기화한다. lock 파일을 삭제·교체하지 않으며 app intent/lock, Nginx current/generation/증거,
   DB 처리 권한도 archive·삭제·직접 수정하지 않는다. 저널이 원래 없으면 archive만 생략한다.
5. 새 immutable tag·root 설정·설치 Compose·watchdog checkout의 일치와 새 A의 live push/PAUSED
   profile을 다시 확인한다. dev watchdog을 새 release로 재개·확인한 뒤 step 6의 bootstrap을
   한 번 실행한다. 저널 부재 시 watchdog은 아무 작업을 하지 않고 허가 조회는 실패하므로,
   archive 자체가 새 배포 허가나 호스트 전체 초기화를 의미하지 않는다.

archive는 과거 감사 증거다. 이후 bootstrap이 실패하면 새 저널과 intent를 보존하고 원인을
확인한다. 이전 archive를 active 경로에 복원·덮어쓰거나 SQL·저널 필드 수정으로 통과시키지 않는다.

## CloudFront에서 바꾸는 항목

dev 배포의 최신 설정과 ETag를 조회한 뒤 API behavior가 참조하는 백엔드 origin만 수정한다.

```text
DomainName: A의 현재 public DNS → Nginx의 현재 public DNS
CustomOriginConfig.HTTPPort: A의 앱 포트 → Nginx의 host 공개 listener 포트
OriginProtocolPolicy: 기존 http-only 유지
```

public origin에는 Nginx의 현재 public DNS를 사용한다. private IP나 컨테이너 내부 포트를
입력하지 않는다. CloudFront는 [1024~65535의 사용자 지정 HTTP 포트](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html)를 지원하므로 host listener가 18090이면 그 포트를 사용할 수 있다.

`/api/*`의 TargetOriginId, 허용 HTTP 메서드, 캐시·쿠키·Authorization 전달 정책,
S3/이미지 origin과 behavior는 유지한다. OAuth 가입 세션·JWT 쿠키·POST·이미지 업로드까지
실제 dev 도메인에서 확인한다. GET 한 번의 성공으로 인증 전달을 검증했다고 판단하지 않는다.
기존과 같은 origin ID를 유지하면 해당 origin을 사용하는 다른 behavior도 함께 영향을 받으므로
수정 전 참조 목록을 확인한다. 승인되지 않은 경로가 있으면 전환을 멈추고 범위를 다시 확인한다.

Nginx listener가 실제 호스트에 바인딩되어 있고, 보안 그룹·라우팅이 CloudFront의 origin 요청을
허용해야 한다. 가능한 경우 [CloudFront origin-facing prefix list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html)를 사용한다.
이 목록은 규칙 quota를 많이 사용하므로 실제 quota/권한을 확인한다. 공유 보안 그룹을
바로 수정하면 prod에도 영향을 줄 수 있다. Nginx 전용 그룹과 모든 부착 그룹의 허용 규칙
합집합을 검토한 뒤 적용한다.

앱 관리 포트와 Nginx probe는 계속 loopback이다. Nginx 템플릿이 전달하는 HTTPS 정보에 맞게
CloudFront viewer HTTPS 정책을 확인한다. Nginx EC2는 상시 기동하며, 나중에 stop/start하면
public DNS 변경 여부를 확인해야 한다.

## 실패 시와 prod 이관

배포 중 실패는 기존 자동 롤백·ATTENTION 정책을 따른다. 자동 롤백은 전환 후 최소 15분
관찰과 봉인 전까지이며, 이후 운영 장애는 별도 감지·수동 복구 대상이다. 실제 알림 발송은
이미 외부에 전달된 효과이므로 앱 롤백으로 취소되지 않는다.

자동화를 끌 때 변수부터 false로 바꾸면 다음 legacy 배포가 항상 A에 실행된다.
B가 실제 서비스를 맡거나 A가 중지 상태일 수 있으므로 **아래 순서를 먼저 수행한다.**

1. 새 develop 배포를 멈추고 진행 중 실행을 모두 마친다. dev flag가 true인 상태에서 필요하면
   수동 Blue-Green으로 A에 복귀한다. A가 실제 HTTP·worker owner이고 B의 종료가 확인돼야 한다.
2. A의 작업 선점을 중단하고 작업 종료·권한 반납을 관리 API로 확인한다. A를 기존 dev 앱과
   runner 설정으로 복구한다. 처리 권한을 갖지 않는 legacy 앱과 활성 BG worker가 겹치면 안 된다.
3. 실제 dev API와 푸시 설정을 확인한 뒤 dev flag를 false로 바꾼다. 다음 legacy 배포가
   실행 중인 A로 향하는지 확인한다. 실제 사용 경로에 A가 남아 있으면 EC2를 중지하지 않는다.
4. B의 dev 앱·runner 라벨/서비스·설정과 dev watchdog을 정리한 뒤에만 B를 prod B로 준비한다.
   prod 자동화를 켜기 전에 dev BG 실행이 남아 있지 않은지 다시 확인한다.
5. prod 적용·검증 후 dev CloudFront를 현재 A DNS로 복구하고 Deployed·실제 API를 확인한 뒤
   dev 전용 Nginx·설정·runner·임시 `BLUE_GREEN_RDS_URL` 소비 코드를 제거한다.
   dev와 prod의 Nginx 컨테이너·경로·포트·저널은 구분하고 prod 자원은 보존한다.

최초 적용 실패도 같은 원칙으로 실제 프로세스·요청 경로·처리 권한을 맞춰 복구한다.
전파 중인 CloudFront를 되돌릴 때는 최신 설정/ETag를 다시 조회한다. 변수만 바꾸거나
이전 ETag로 덮어써 복구하지 않는다. 판단할 수 없는 worker·pending 상태는 강제 해제하지 않고
서버를 유지한 채 Actions 실행 요약과 상태를 확인한다.
