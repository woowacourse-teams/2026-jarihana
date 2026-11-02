# 배포 점검 지표 적용 상태

점검 요청 제외와 수집 주기는 코드 포함, 서버 설치와 실제 관측을 구분해 확인한다.
Git 병합만으로 설치된 제어 릴리스나 활성 Nginx 설정이 바뀌지는 않는다.

| 항목 | 저장소 원본과 적용 경계 |
| --- | --- |
| PROD 배포 관측 주기 | 기본 timer와 prod 30초 drop-in 원본을 함께 관리한다. 설치 경로와 유효 주기는 [중앙 수집기 운영](CENTRAL-DEPLOYMENT-COLLECTOR.md#실행-주기와-권한)을 따른다. |
| 공개 요청의 점검 표시 제거, 내부/직접 점검의 표시 | [PR #548](https://github.com/woowacourse-teams/2026-jarihana/pull/548)에서 Nginx 템플릿과 직접 점검 스크립트를 관리한다. PR #537에는 해당 변경이 없다. |
| 백엔드 점검 제외와 무트래픽 지표 | 점검 헤더를 해석하는 백엔드 설정과 함께 적용한다. 초기 0값 지표 등록 및 실제 Nginx 경로 검증은 PR #548의 범위다. 수집 부재를 0으로 대신하지 않는다. |
| Grafana의 관측 만료 기준 | [쿼리 카탈로그](../../monitoring/grafana/deployment/queries.mjs)가 원본이다. 생성 JSON의 Git 병합과 실제 모니터링 배포를 구분한다. |

## 운영 반영 확인

- 보호된 제어 태그는 이동하지 않는다. 검토한 새 불변 릴리스를 배포하고 coordinator/A/B의
  ref/SHA 및 설치 경로를 일치시킨다. 구성 절차는 [배포 환경 구성](../../blue-green-deploy/controller/environment.md)을 따른다.
- 활성 Nginx에서 공개 `/api/`는 `X-Jarihana-Deployment-Probe`를 제거하고,
  내부 `/__deployment`는 `true`를 주입하는지 확인한다. 직접 후보 검사에도 같은 표시가 필요하다.
  활성 설정만 수동 수정하면 다음 트래픽 전환에서 기존 템플릿으로 덮어쓸 수 있다.
- 백엔드 필터가 설치되지 않았거나 점검 표시가 없으면 해당 요청은 HTTP 지표에 포함될 수 있다.
  코드와 설정을 함께 대조하기 전에는 모든 점검 요청이 제외됐다고 판단하지 않는다.
- timer/service와 textfile, Prometheus의 실제 수신 시각은
  [읽기 전용 확인](CENTRAL-DEPLOYMENT-COLLECTOR.md#읽기-전용-확인)을 따른다.
  수집 주기와 소비자 유효 시간은 별도 설정이다.
