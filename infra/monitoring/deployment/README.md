# 중앙 배포 수집기 원본

운영 Nginx 서버에서 실행 중인 수집기와 전용 Alloy, systemd 설정을 보존한다.
구성과 권한, 주기, 지표 해석, 재구성은 [운영 가이드](../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md)를 따른다.

- `collect.sh`, `journal.sh`, `traffic.sh`: 배포 상태와 실제 경로를 읽어 textfile을 만든다.
- `config.alloy`, `docker-compose.yml`: textfile scrape와 remote write 구성이다.
- `systemd/`: 기본 unit과 실제 prod의 30초 override다.
- `../../scripts/deploy/actions/`: 운영 수집기가 사용하는 helper 복사본이다. 배포 제어기 원본과 별도로 유지한다.

이 디렉터리는 서버 설치본의 기준 원본이다. Git 병합만으로 서버 파일이 교체되지 않는다.
설치기와 DEV Actions 수집기는 포함하지 않는다.

Linux root 환경의 검증:

```sh
bash infra/tests/deploy/telemetry/run-tests.sh
# Docker 사용 가능 시 Alloy의 실제 ready/healthy 확인
bash infra/tests/deploy/telemetry/run-tests.sh --alloy-smoke
```
