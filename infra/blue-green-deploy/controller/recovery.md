# Blue-Green 장애 복구

배포 실패, 취소 또는 처리 결과가 불확실할 때 복구 범위와 조사 순서를 확인한다.
운영 전제는 [배포 실행의 적용 버전](deployment.md#적용-버전)을 따르고,
현재 실행과 관찰 결과는 [상태 확인](status.md)에서 먼저 대조한다.

- [실패 시 자동 처리](#실패-시-자동-처리)
- [복구 허가와 기한](#복구-허가와-기한)
- [수동 조사](#수동-조사)

## 실패 시 자동 처리

| 상황 | 처리 |
| --- | --- |
| 후보 준비 또는 프론트 원본 검증 실패 | 기존 HTTP 유지. worker 인계에 들어갔다면 권한 상태도 확인한다. |
| 전환 후 배포 확정 전 이상 | 이전 HTTP 복구, 변경한 프론트 복구, 후보 worker 반납, 이전 worker 재개를 시도한다. |
| 후보 상태 미확정 | 이전 앱 API와 동일 Nginx 세대가 증명될 때만 HTTP 복구. 이전 worker 재개는 보류한다. |
| 프론트 복구 실패 | pending과 원본을 보존하고 새 배포와 정리를 차단한다. |
| 새 앱 정상, 이전 연결 종료만 미확인 | 새 서비스 유지와 양쪽 EC2 보존. 강제 종료하거나 자동 롤백하지 않는다. |
| 배포 확정 후 장애 | 자동 롤백 구간 밖이다. 이전 EC2의 재기동과 앱 검증이 필요한 별도 운영 복구다. |

공동 배포는 이전 백엔드와 프론트, 프론트-only는 이전 화면, 백엔드-only는 이전 백엔드를
복구한다. 정상 롤백도 Actions 결과는 실패다. HTTP만 복구됐으면 전체 복구 성공이 아니다.
앱 롤백으로 DB 스키마, 저장된 데이터나 이미 발송한 알림을 되돌리지 않는다.

## 복구 허가와 기한

API 복구는 S3 접근과 임시 CLI 준비에 의존하지 않는다. 복구 허가는
[coordinator의 복구 경로](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/blue-green-deploy/scripts/actions/coordinator.sh)에서 다음과 같이 발급한다.

| 복구 작업 | 허가 조건과 기한 |
| --- | --- |
| 프론트 연계가 활성화된 prod의 후보 worker 반납 | API 복구 성공 뒤 2400초, 프론트 전송 시간 포함 |
| frontend-only 복구 | 유효한 저널의 old==target과 frontend-* pending을 확인한 뒤 1800초 |
| 이전 worker 재개 등 일반 앱 작업 | [일반 작업 기한](architecture.md#실행-보호와-기한) 적용 |

API 복구가 실패하면 기존 pending과 남은 기한을 유지한다. 만료된 허가를 연장하지 않으며,
job timeout만으로 복구 성공을 보장하지 않는다.

## 수동 조사

1. 새 배포와 종료 작업을 중단하고 run/deployment ID, 저널, intent, S3 state와 ETag,
   current/previous/pending manifest를 보호된 기록에 보관한다.
2. 실제 Nginx 경로, 양쪽 EC2와 컨테이너, 이미지, 현재 boot와 worker owner, 진행 작업을 대조한다.
3. 공개 URL의 모든 선언 파일을 보관 원본과 비교한다. HTTP 200이나 index.html 하나로 성공을 판단하지 않는다.
4. 복구할 API와 화면 조합을 정한다. 후보 작업 종료를 증명하지 못하면 이전 worker를 재개하지 않는다.
   프론트 복구는 worker 불확실성과 별도로 시도할 수 있지만 같은 허가 기한과 파일 검증을 지킨다.
5. 실제 결과와 일치하는 저널 및 S3 상태 조정안을 검토한다. 자동 reconcile 명령은 제공하지 않는다.
   pending 삭제, stale ETag 덮어쓰기, 임의 SQL, 새 명령 ID나 UI rerun으로 통과시키지 않는다.
6. API, worker, 화면, 원본과 상태의 일치를 확인한 뒤에만 새 배포와 EC2 정리를 재개한다.

worker 인계와 정상 종료의 상세 조건은 [동작 구조](architecture.md#worker-인계와-정상-종료),
정상 배포 절차는 [배포 실행](deployment.md)을 따른다.
