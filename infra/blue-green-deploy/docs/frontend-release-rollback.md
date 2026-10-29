# prod 프론트엔드 릴리스 보관과 복구

프론트엔드는 같은 커밋에서 만든 파일을 S3에 보관하고 백엔드 이미지 digest와 함께 배포한다.
백엔드 전환 직후 프론트엔드를 게시하며, 배포 확정 전 실패하면 이전 조합으로 복구한다.
선택 이유는 [인프라 ADR 0006](../../docs/adr/0006-s3-paired-frontend-rollback.md),
worker와 EC2 안전 경계는 [인프라 ADR 0005](../../docs/adr/0005-nginx-ec2-blue-green-deployment.md)를 따른다.
이 문서는 설치와 운영 절차이며 운영 AWS 적용 완료를 뜻하지 않는다.

## 저장 위치와 실행 주체

버킷은 `techcourse-project-2026`이다. CloudFront가 읽는 `jarihana/frontend/`는 그대로 유지한다.
복구 원본은 공개 prefix 밖의 `jarihana/frontend-releases/`에 보관한다.

```text
jarihana/
├── frontend/
│   ├── index.html
│   └── assets/…                    # 이전 릴리스의 해시 자산도 유지
└── frontend-releases/
    ├── baseline-<run-id>/
    │   ├── files/…                 # 최초 실제 공개 파일
    │   └── release.json
    ├── <source-sha>-<run-id>/
    │   ├── files/…                 # 새 빌드의 원본
    │   └── release.json
    └── state.json
```

GitHub-hosted runner가 릴리스 소스 커밋을 기존 prod Variables/Secrets로 빌드한다.
GitHub Actions artifact는 runner 간 전달에 사용한다. Nginx coordinator가 기존 잠금과
배포 저널 안에서 S3 보관, 게시 및 복구를 실행한다. S3 접근은 기존 EC2 IAM 역할을 사용하며
새 AWS 키나 OIDC를 요구하지 않는다. 모니터링 EC2에 파일 배포를 맡기지 않는다.

### workflow 진입점

`backend-prod-deploy.yml`이 main의 백엔드와 프론트엔드 변경을 함께 받는다.
`BLUE_GREEN_PROD_ENABLED=true`인 경우 main push 또는 `blue_green_mode=deploy` 수동 실행에서
연결 배포를 실행한다. `frontend-prod-deploy.yml`은 독립 push/dispatch가 없는
`workflow_call` 빌드 전용이며 `prod` environment를 사용한다. 전달 artifact는
`frontend-release-<source-sha>-<run-id>`이고 같은 실행에서 반환한 artifact ID로 받는다.
GitHub artifact의 7일 보존은 S3 복구 원본의 보관 기간을 뜻하지 않는다.

main push의 backend/infra 및 백엔드 배포 workflow 변경이 없으면 frontend-only를 선택한다.
frontend 변경이 없고 backend만 변경되면 backend-only를 선택한다. infra 또는 공동 배포 workflow
변경은 양쪽 배포로 취급한다. 수동 `backend_only=true`와 `frontend_only=true`는 함께 지정할 수 없다.
backend-only에서는 프론트 빌드와 공개 파일 게시/복원을 하지 않고 `state.json`의 백엔드 조합만
조건부 갱신한다. manifest의 `backend_image`는 최초 보관 당시 값이고, 현재 조합은 pointer의
`backend_image`가 소유한다. 뒤이은 프론트 배포도 이 현재 조합을 확인한다.

| 이번 배포 대상 | 관찰 중 실패 시 복구 범위 |
| --- | --- |
| 프론트와 백엔드 | 이전 백엔드와 이전 프론트 파일 |
| 프론트만 | 이전 프론트 파일, 현재 백엔드 유지 |
| 백엔드만 | 이전 백엔드, 현재 프론트 파일 유지 |

수동으로는 `frontend_only=true`, `blue_green_mode=deploy`를 사용하고 `image_tag`를 비운다.
이 경우에도 `BG_MODE`는 `deploy`이고 coordinator에는 `BG_FRONTEND_ONLY`를 전달한다.
현재 `frontend-prod-deploy.yml`만 별도로 실행하는 운영 경로는 없다.

`BLUE_GREEN_PROD_ENABLED=false` 또는 미설정은 **새 운영 배포만 중단하고 현재 서비스를
유지하는 스위치**다. main push와 수동 `deploy`를 hosted `release-enabled` 단계에서 명확한
실패로 끝내고 서버나 S3를 변경하지 않는다. legacy 재배포나 백엔드 재시작으로 자동 전환하지
않는다. 수동 선택지는 `bootstrap`, `deploy`이며 기본값은 `deploy`다. 명시적인 `bootstrap`만
비활성 상태에서 허용한다. 이는 기존 조건에 따른 최초 백엔드 권한 등록이며 프론트엔드 빌드,
S3 게시나 HTTP 전환을 하지 않는다. 기존 control tag가 새 기능을 지원하지 않아도 운영 중인
서비스를 건드리지 않고 새 배포를 차단한다.

| coordinator 단계 | 프론트엔드 작업 |
| --- | --- |
| `plan` | preflight, 최초 baseline 또는 current 검증, 새 원본 보관과 pending 생성 |
| `switch` | 백엔드 HTTP 전환 직후 프론트엔드 게시 및 공개 해시 검사 |
| `seal` | 양쪽 관찰과 drain 확인, 전체 공개 파일 재검증 후 프론트엔드 상태 확정 |
| `frontend-publish` | frontend-only 게시, 현재 백엔드 경로 유지 |
| `observe`, `frontend-seal` | frontend-only 900초 HTTP 관찰과 상태 확정 |
| `frontend-recover` | 이전 프론트엔드 파일 복구 및 공개 해시 검사 |

이 명령은 최신 run 허가와 보호 저널을 확인하는 workflow 내부 단계다. 수동으로 shell 함수를
호출하거나 standalone 복구 명령으로 사용하지 않는다. S3 경로와 CloudFront ID는
`frontend.sh` 상수이며 새 frontend topology 필드는 추가하지 않는다.

### 파일과 상태의 계약

`release.json`의 `schema_version`은 1이며 `release_id`, `source_commit`,
`backend_image`, `run_id`, `deployment_id`, `control_sha`와 `files`를 기록한다.
`files` 항목은 `path`, `sha256`, `size`를 가진다. `backend_image`는 태그가 아닌 정확한
이미지 digest다. 최초 baseline의 실제 소스 커밋을 알 수 없으면 `source_commit`은 null이다.
기존 커밋을 다시 빌드해 baseline으로 대체하거나 출처를 추정하지 않는다.

릴리스별 `files/`와 완료 manifest는 덮어쓰지 않는다. 파일을 다 보관하고 검증한 뒤
`release.json`을 마지막에 쓴다. 원본이 있더라도 manifest가 완성되지 않았으면 완료된
복구 원본으로 취급하지 않는다. Secrets와 환경 변수 원문은 manifest에 기록하지 않는다.

`state.json`은 `schema_version: 1`, `current`, `previous`, `pending`, 현재 조합의 `backend_image`를 기록한다.
`pending`에는 `run_id`, `source_commit`, `control_sha`, `deployment_id`, `release_id`,
`previous_release_id`, `backend_image`, `previous_backend_image`, `frontend_changed`, `status`가 있어
해당 작업의 변경 범위와 복구 대상을 연결한다. 갱신은 읽은 ETag에
대한 조건부 쓰기(CAS)를 사용한다. 릴리스 객체 생성은 기존 객체가 없는 경우에만 허용한다.
Actions 직렬화만 믿고 오래된 실행의 상태 덮어쓰기를 허용하지 않는다.

공개 prefix에는 이전 릴리스의 해시 자산이 남을 수 있다. 따라서 공개 prefix의 전체 객체 집합이
현재 manifest와 정확히 같아야 한다는 뜻은 아니다. 현재 manifest가 선언한 파일의 실제 바이트를
검증하며, 선언한 파일의 누락이나 변경은 drift로 중단한다. drift를 자동으로 새 정상 상태로
등록하지 않는다. 릴리스 보관과 공개 자산 모두 별도 수명 정책 합의 전에는 자동 삭제하지 않는다.

### GitHub 호출 예산과 취소 확인

파일 루프와 EC2/worker 대기 중의 실행 상태 확인은 성공한 응답을 최대 10초 재사용한다.
매 파일의 시작과 끝에는 저널 소유권, 실제 상태 일치, topology, 허가 만료를 계속 검사한다.
읽기 전용 15분 관찰의 기존 30초 상태 재사용은 유지한다. 재사용 기간 중 취소되면 여러 파일이
처리될 수 있다. 다음 원격 검사 경계에서 감지하므로 감지 지연에는 현재 파일의 전송 시간도 포함된다.
실패한 조회는 재사용하지 않고, 시계가 역행하면 새 원격 확인이 필요하다.

파일 루프 종료, 완료 manifest, S3 pointer 갱신, HTTP 전환, EC2 변경과 배포 확정은 캐시 없는
원격 확인을 유지한다. 앱의 worker 변경 POST, 컨테이너 삭제/시작/SIGTERM과 최종 receipt 전에도
원격 실행을 다시 확인한다. heartbeat만 갱신하는 대기 루프는 원격 중복 조회를 만들지 않는다.

모든 `bg_github` 응답에서 GitHub의 `x-ratelimit-limit`, `remaining`, `reset`, `resource`를 읽는다.
숫자가 없거나 중복/잘못된 값이면 변경을 허용하지 않는다. 별도 `/rate_limit` 조회는 추가하지 않는다.

| 단계 | 응답 처리 후 필요한 잔여 요청 |
| --- | ---: |
| 새 plan 및 bootstrap | 900 |
| 일반 배포와 관찰/확정/정리 | 500 |
| 자동 롤백과 중단 상태 기록 | 10 |

일반 배포가 500회 미만의 잔여 예산을 만나면 성공으로 처리하거나 제한 해제까지 맹목적으로
재시도하지 않는다. workflow의 기존 실패 경로로 복구를 시도한다. 복구는 낮은 예산 기준으로
실행하되 기존 run 신원, 로컬 허가, ETag와 상태 검사는 모두 유지한다. 잔여량이 900회 미만이면
다음 배포의 plan을 서버/S3 변경 전에 거부하므로 같은 시간대의 연속 배포가 예산을 잠식하지 않는다.
응답은 현재 저장소의 공유 예산을 반영하며 Actions 내부 호출이나 다른 workflow의 소비도 포함한다.

500회는 복구를 위한 보존 기준이며 다른 workflow가 사용할 수 없는 전용 할당은 아니다.
다른 호출자가 갑자기 나머지를 소진하거나 GitHub가 403/429를 반환하면 복구까지 실패할 수 있다.
이 경우 원본과 pending을 보존하고 수동 조정한다. 전체 저장소의 모든 호출자에 대한 원자적 예산
예약이나 GitHub 장애 중 자동 복구를 보장하지 않는다. guardian은 기존 30초당 두 조회를 유지하며
전체 경로 호출량 회귀에 포함한다. 전체 예산 검증 명령은 다음과 같다.

```bash
bash infra/blue-green-deploy/tests/actions/run-api-budget.sh
```

이 검증은 실제 배포 함수를 GitHub/AWS/앱/Docker 대역 및 가상 시계로 실행한다. 공동/단독 배포,
최초/기존 baseline, 900초 관찰과 최종 공개 검사 실패 후 롤백, guardian, 파일별 지연을 포함한다.
실제 네트워크, checkout/artifact 액션 내부 요청, 다른 workflow와 운영 장애 주입 실측은 별도다.

2026-10-29 실행에서는 79개 파일의 최초 공동 배포가 292회, 최종 공개 검사 실패 후 롤백까지
299회였다. 기존 baseline에서는 각각 285회와 292회, 프론트 단독은 136회와 140회,
백엔드 단독은 282회와 287회였다. 파일 처리마다 가상 1초를 더한 최초 공동 배포는 421회와
464회, 1,000개 파일의 전송 지연 없는 최종 실패/롤백은 299회였다. 이는 실행 기록이며
파일 크기나 네트워크 속도와 무관한 고정 상한을 뜻하지 않는다. 실행 중 외부 호출자가 500회를
소비한 시험은 일반 단계를 거부한 뒤 자체 108회, 외부 소비 포함 608회로 롤백을 완료했다.

## 실제 적용 전 준비

앱과 프론트 파일을 복구해도 DB 스키마와 배포 중 저장한 데이터는 돌아가지 않는다.
새 enum 값 등 기존 앱이 읽지 못하는 변경은 [DB 변경 규칙](../../../docs/database-changes.md)에 따라
별도로 준비한다. 이 배포 제어 코드는 특정 회원 유형의 호환성을 검사하거나 가입 기능을 제어하지 않는다.
이전 화면을 계속 열어둔 사용자에게는 새로고침이 필요할 수 있다.
제어 코드 버전은 세 가지 배포 범위와 호출 예산 검사를 지원하는 `FE_RELEASE_CAPABILITY=3`를 사용한다.

### 공통 적용 순서

1. [prod Stage 1 준비](prod-bluegreen-preparation.md)의 dev 반환, DB 연결 예산, 최초 worker
   등록과 호스트 보호 설정 게이트를 먼저 따른다. 프론트엔드 보관 기능이 legacy worker를
   안전하게 종료하거나 최초 backend bootstrap을 대신하지 않는다.
2. 새 workflow와 `frontend.sh`를 포함한 검토된 커밋에 새 immutable control tag를 만든다.
   기존 `refs/tags/deployment-control-prod-20261027-01`을 이동하지 않는다. 새 tag/SHA를
   Nginx/A/B의 보호된 topology 설정과 `BLUE_GREEN_CONTROL_REF`에 동일하게 반영한다.
   기능이 없는 옛 control checkout이면 S3나 EC2 변경 전 preflight에서 중단해야 한다.
   완료 저널도 control SHA와 topology digest를 대조하므로 tag/설정만 바꿔 이전 저널을
   자동 채택하지 않는다. 최초 bootstrap 또는 기존 완료 저널의 검토된 이관을 별도로 준비한다.
3. Nginx coordinator의 기존 IAM 역할에서 버킷 조회와 두 prefix에 한정된 `ListBucket`,
   `GetObject`, `PutObject` 및 `GetDistributionConfig`, `GetCachePolicy` 읽기 권한을 확인한다.
   `ListBucket`은 버킷 리소스와 prefix 조건으로 제한하고 객체 권한은 공개/보관 prefix에 한정한다.
   CloudFront 쓰기나 invalidation, 버킷 전체 삭제 권한은 요구하지 않는다.
4. S3 원본과 공개 `https://jarihana.com` 접근, AWS CLI의 조건부 쓰기 지원, 임시 디스크 공간과
   해시 계산 도구를 점검한다. 조회 성공만으로 Put 권한까지 확인했다고 쓰지 않는다.
   실제 쓰기 검증은 승인된 보관 prefix와 해당 적용 기록에서 확인한다.
   coordinator job은 공식 AWS CLI 2.38.5를 고정 해시로 검증해 `RUNNER_TEMP`에 설치하고
   해당 job 뒤 정리한다. 보호 저널 디렉터리가 있는 디스크는 최소 2 GiB 여유가 필요하다.
   보관 파일은 최대 1,000개, 파일당 64 MiB, 합계 512 MiB로 제한한다. 빈 파일, symlink와
   특수 파일은 거부하며 `index.html`, `sw.js`, `manifest.webmanifest`와 `assets/` 파일이 있어야 한다.
   `index.html`이 참조하는 로컬 JavaScript 파일도 실제 파일 목록에 존재해야 한다.
5. prod 배포가 진행 중이거나 기존 workflow가 대기 중인지 확인한다. live prefix를 쓰는 다른
   작업과 겹치지 않도록 기존 실행을 정리한 뒤 새 경로를 적용한다. S3 업로드 도중 취소하거나
   호스트를 중지하지 않는다. 활성화 이후 옛 프론트엔드 단독 게시 경로로 우회하지 않는다.

### CloudFront 확인

2026-10-29 읽기 전용 운영 조회에서 확인한 기준은 다음과 같다. 적용 직전 같은 값을 다시 읽는다.

| 항목 | 기준 |
| --- | --- |
| Distribution | `E1YDHL1SDC4C1C` |
| 기본 origin | `techcourse-project-2026` S3, OriginPath `/jarihana/frontend` |
| 기본 cache policy | `Managed-CachingDisabled`, `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` |
| TTL | 최소, 기본, 최대 모두 0 |
| API | `/api/*` Nginx origin 유지 |
| 이미지 | `/images/*`의 별도 `/jarihana` origin 유지 |

```sh
aws cloudfront get-distribution-config --id E1YDHL1SDC4C1C \
  --query 'DistributionConfig.{DefaultCacheBehavior:DefaultCacheBehavior,Origins:Origins,CacheBehaviors:CacheBehaviors}'
aws cloudfront get-cache-policy --id 4135ea2d-6df8-44a3-9df3-4b5a84be39ad \
  --query 'CachePolicy.CachePolicyConfig.{Name:Name,MinTTL:MinTTL,DefaultTTL:DefaultTTL,MaxTTL:MaxTTL}'
```

위 읽기 전용 조회 기록은 S3 prefix 접근이나 새 릴리스 쓰기 성공의 증거가 아니다.
당시 호스트 AWS CLI의 `list-objects-v2` 오류로 prefix 조회는 미확인 상태였다.
CLI 설치와 실제 권한 및 원본 보관 검증은 적용 게이트에 남겨 둔다.

기본 경로 캐시가 비활성인 조건에서 CloudFront 변경이나 invalidation 없이 공개 바이트를
검사한다. 이 조건이 달라지면 배포를 중단하고 캐시 정책과 복구 계약을 먼저 재검토한다.
S3 캐시 메타데이터만 바꿨다는 이유로 엣지와 브라우저 캐시가 모두 해제됐다고 판단하지 않는다.

## 최초 baseline을 읽고 확인하는 순서

최초 보관은 실제 서비스 중인 `jarihana/frontend/` 파일의 스냅샷이다. 과거 SHA를 받아 다시
빌드하는 단계가 아니다. 별도 baseline-only 명령이나 dry-run, baseline 뒤의 수동 승인 대기는
없다. `plan`은 보관과 검증이 성공하면 다음 단계로 진행한다. 아래는 운영자가 처음 적용할 때
알아야 할 순서이며 읽기 명령으로 생성 결과를 적용 기록에 남긴다.

1. 진행 중인 S3 writer가 없고 실제 활성 API 및 백엔드 digest를 알고 있는지 확인한다.
   coordinator 저널, 실제 Nginx 대상과 실행 이미지가 일치해야 한다. 모르는 digest를
   현재 GitHub 태그로 대신 채우지 않는다.
2. 첫 coordinated 배포의 보관 단계에서 `baseline-<run-id>/files/`와 `release.json`을 만든다.
   이 단계는 공개 파일 게시와 대기 EC2 시작보다 앞선다. 실제 파일의 경로, 크기와 SHA-256을
   계산해 manifest를 완성하며 당시 활성 백엔드 digest와 연결한다.
3. 아래 읽기 명령으로 baseline manifest, 상태와 공개 목록을 확인한다. `<run-id>`는 실제 실행
   번호로 바꾼다. 저장 위치와 `backend_image`, 실제 파일의 일치 여부를 적용 기록에 남긴다.

   ```sh
   aws s3api list-objects-v2 --bucket techcourse-project-2026 \
     --prefix jarihana/frontend/ --query 'Contents[].{Key:Key,Size:Size}'
   BASELINE_ID='baseline-<run-id>' # 실제 실행 번호로 치환한다.
   aws s3 cp "s3://techcourse-project-2026/jarihana/frontend-releases/$BASELINE_ID/release.json" -
   aws s3 cp s3://techcourse-project-2026/jarihana/frontend-releases/state.json -
   ```

4. baseline 생성이 중간에 실패하면 미완료 원본을 보존하고 원인을 조사한다. manifest나 pending을
   삭제해 같은 실행을 다시 허용하지 않는다. live에 쓰기가 없었는지도 실제 파일로 확인한다.
5. 이후 배포에서는 `current` manifest의 파일과 live를 검증한다. 일치하면 보관된 원본을
   재사용하고 매번 baseline 전체를 만들지 않는다. 불일치는 수동 조사 후에만 조정한다.

baseline 원본이 있다는 것만으로 복구 검증이 끝난 것은 아니다. 실제 실패 주입에서 그 원본을
게시하고 공개 바이트를 확인하는 검증까지 별도로 필요하다.

## 정상 배포와 실패 처리

백엔드 변경 배포는 후보를 준비하기 전에 이전 파일 보관과 새 릴리스 검증을 마친다.
HTTP를 후보로 바꾼 직후 같은 릴리스의 프론트엔드를 게시한다. 지원 파일을 먼저 올리고
`index.html`을 마지막에 올리며 변경 가능한 파일은 캐시를 재검증하도록 게시한다.
S3 업로드 완료만 보지 않고 공개 URL에서 받은 파일의 SHA-256이 manifest와 같은지 확인한다.
그 후 HTTP와 앱의 전체 900초 관찰을 수행한다. 관찰 중에는 `index.html`, `sw.js`,
`manifest.webmanifest`의 공개 바이트를 30초 간격 기준으로 다시 검사한다. API 조회와 파일
다운로드 시간이 추가되므로 정확한 30초 주기는 보장하지 않는다. 배포 확정 직전에는 모든 선언된
공개 파일을 다시 검증한 뒤 프론트엔드 상태를 확정한다. 이전 EC2 정리는 이 경계 뒤에만 가능하다.

프론트엔드만 변경된 main 배포는 완료된 보호 저널의 실제 활성 백엔드 digest를 유지한 새 쌍을
만든다. 대기 EC2 시작이나 API 및 worker 교대 없이 프론트엔드를 게시하고 현재 API를
900초 관찰하고 같은 프론트엔드 반복 및 최종 검사를 수행한다. 이전 백엔드 digest를 입증할
완료 저널이 없으면 추정해서 진행하지 않는다.

| 상황 | 처리와 확인 |
| --- | --- |
| 보관, manifest 또는 live 검증 실패 | 공개 게시와 EC2 변경 전에 중단한다. 기존 정상 조합과 미완료 원본을 보존한다. |
| 백엔드 전환 후 프론트엔드 업로드 또는 공개 해시 실패 | 이전 API와 이전 프론트엔드 복구를 시도한다. 복구해도 배포 결과는 실패다. |
| 900초 관찰 중 백엔드 실패 | 같은 이전 릴리스 조합으로 복구한다. worker 반납과 재개의 기존 안전 조건을 지킨다. |
| 후보 worker 종료 미확정 | 이전 API 복구를 먼저 시도한다. 프론트엔드 복구는 독립적으로 시도하고 이전 worker 재개는 보류한다. |
| 프론트엔드 복구 실패 | `NEEDS_ATTENTION`과 pending을 보존한다. 새 배포와 정리를 차단하고 관련 EC2와 원본을 유지한다. |
| 취소, 응답 유실 또는 상태 CAS 충돌 | 성공이나 무변경을 추정하지 않는다. 상태와 원본을 보존하고 수동으로 실제 결과를 대조한다. |
| 이전 연결 drain 미확인, `cleanup_deferred` | 기존 정책대로 정상 후보를 유지하고 양쪽 EC2를 보존한다. 종료나 자동 롤백을 강행하지 않는다. |

### 복구 순서와 유효 기한

API 복구 단계 `rollback-http`는 S3 접근이나 임시 AWS CLI 설치에 의존하지 않는다.
먼저 API 복구를 시도하고 프론트엔드 복구를 진행한 뒤 후보 worker 반납을 실행한다.
prod에서 API 복구가 성공하면 후보 worker 복구 허가를 2,400초로 발급해 그 사이의
프론트엔드 전송 시간을 포함한다. dev의 기존 600초 허가는 유지한다.

frontend-only 복구는 아직 유효한 저널에서 `old==target`이고 pending 작업이 `frontend-*`일
때만 `frontend-recover` 허가를 1,800초로 발급한다. worker 허가를 만들거나 연장하지 않는다.
백엔드와 함께 배포한 실행에서 API 복구가 실패하면 기존 pending과 남은 기한을 그대로 유지한다.
그 경우 프론트엔드 복구를 독립적으로 시도하더라도 남은 기한 안에 끝내지 못하면 중단하고
`NEEDS_ATTENTION`으로 보존한다. 만료된 허가를 자동으로 연장해 진행하지 않는다.

프론트엔드 복구 job의 25분 timeout은 성공을 보장하는 시간이 아니다. runner 대기, 파일 전송,
검증 및 이전 단계에서 소모한 허가 기한을 함께 고려해야 한다. 기한 만료나 응답 유실이면
원본과 저널 및 필요한 호스트를 유지하고 아래 수동 조사 절차를 따른다.

공개 게시와 복구는 파일 단위 복사이므로 잠시 혼합될 수 있다. 기존 해시 자산을 보존하고
`sync --delete`로 대량 제거하지 않는다. 이미 열린 탭은 이전 JavaScript를 계속 실행할 수
있으므로 프론트엔드 복구만으로 모든 브라우저가 즉시 이전 버전이 된다고 보장하지 않는다.
지원할 구버전 화면과 API 및 DB 스키마의 호환성이 필요하다.

## 미확정 상태의 수동 조사와 조정

자동 reconcile 명령은 제공하지 않는다. 이 절차는 확인 목록이며 임의 state 수정이나 기존 실행의
재시도 허가가 아니다. 외부 요청이 이미 반영됐을 수 있으므로 먼저 실제 상태를 대조한다.

1. 새 배포와 관련 종료 작업을 중단하고 기존 run ID, deployment ID, coordinator 저널,
   `state.json`의 내용 및 ETag, current/previous/pending manifest를 보호된 적용 기록에 보관한다.
   원본과 pending을 삭제하지 않는다.
2. 실제 Nginx upstream, 양쪽 EC2 상태, 실행 이미지 digest, worker owner/세대와 진행 작업을
   읽는다. API를 복구할 수 있는지와 worker 재개가 안전한지는 별도로 판단한다.
3. live 파일과 공개 URL의 실제 바이트를 current, previous, pending manifest에 대조한다.
   S3 upload 응답 성공, HTTP 200 또는 `index.html` 하나만으로 전체 파일의 일치를 판단하지 않는다.
   어느 manifest에도 맞지 않으면 혼합 상태로 기록한다.
4. API 복구 대상과 프론트엔드 원본을 한 쌍으로 정하고 정확한 명령 및 실패 시 대응을 검토한다.
   후보 종료가 입증되지 않으면 이전 worker를 재개하지 않는다. frontend 복구는 worker 불확실성과
   별도로 시도할 수 있으나 실제 원본과 파일 검증을 생략하지 않는다.
5. 복구한 API와 모든 선언된 공개 파일을 검증한 뒤, 실제 상태를 반영할 보호 저널과 S3 상태의
   조정안을 작성한다. stale ETag로 덮어쓰지 않는다. 자동화에 통과시키려고 `NEEDS_ATTENTION`이나
   pending만 지우지 않는다. 조정 뒤에도 오래된 run을 재실행하지 않는다.
6. worker와 API, 화면, 원본 및 state의 일치가 확인된 뒤에만 새 배포나 EC2 정리를 재개한다.
   원본 보존은 유지한다. 배포 확정 후 장애는 별도 운영 복구이며 이전 EC2의 재기동과 앱 검증이 필요하다.

## 검증 기록의 구분

2026-10-29 격리 계약 테스트 177개와 ShellCheck를 통과했고 실제 빌드 파일 79개,
15,810,977바이트를 manifest 생성기로 검증했다. 이 manifest의 소스, run과 backend 메타데이터는
오프라인 시험용 값이며 운영 배포 원본이 아니다.

로컬 계약 테스트는 S3 조건부 쓰기, 해시 불일치와 복구 순서를 검증하지만 실제 IAM,
CloudFront, GitHub runner, 브라우저 캐시와 900초 운영 관찰을 대신하지 않는다.
[README의 검증 명령](../README.md#검증)으로 확인한 로컬 결과와 실제 적용 기록을 구분한다.
운영 적용 때에는 정상 배포, 프론트엔드만 변경, 업로드 중 실패, 공개 해시 불일치, 백엔드 관찰 실패,
worker 상태 미확정, 복구 실패 및 취소를 각각 기록하고 이전 조합과 보존 상태를 직접 확인한다.
