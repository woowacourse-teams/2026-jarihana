# 자리하나 인프라

이 디렉터리는 특정 애플리케이션 하나에 속하지 않는 운영 설정을 관리합니다. 현재
`infra/docker-compose.yml`은 운영 PostgreSQL만 실행합니다. 백엔드 애플리케이션 운영 Compose는
`backend/docker-compose-prod.yaml`에서 관리합니다.

## 운영 PostgreSQL Compose

`infra/docker-compose.yml`은 다음 리소스를 소유합니다.

| 항목 | 값 |
| --- | --- |
| Compose 프로젝트 | `infra` |
| PostgreSQL 컨테이너 | `jarihana-db-postgres` |
| Docker 네트워크 | `infra_default` |
| 데이터 볼륨 | `infra_postgres-data` |
| 호스트 포트 | `127.0.0.1:5432` |

PostgreSQL 데이터베이스, 사용자와 내부 서비스 이름은 `jarihana`, `jarihana`, `postgres`입니다.
백엔드 운영 Compose는 외부 네트워크 `infra_default`에 연결하고
`jdbc:postgresql://postgres:5432/jarihana`로 접속합니다.

## 배포 워크플로

`main` 브랜치에 `infra/docker-compose.yml` 또는 `.github/workflows/infra-build.yml` 변경이
push되면 Infrastructure Docker Deploy 워크플로가 실행됩니다. 이 워크플로는
`POSTGRES_PASSWORD` 시크릿만 사용하고 애플리케이션 이미지나 백엔드 시크릿을 다루지 않습니다.

백엔드 배포 워크플로와 인프라 배포 워크플로는 GitHub Actions 공유 concurrency를 사용하지
않습니다. 대신 운영 서버의 `/tmp/jarihana-production-deploy.lock` 파일에 `flock`을 잡은 뒤
Docker 상태를 바꿉니다. 운영 Runner 호스트에는 Linux `util-linux`의 `flock` 명령이 필요합니다.

최초 운영 Compose 분리 배포는 인프라를 먼저 실행한 뒤 백엔드를 실행합니다. 백엔드 배포는
`infra_default` 네트워크와 healthy PostgreSQL 컨테이너가 없으면 실패합니다.

운영 워크플로는 기존 PostgreSQL 컨테이너가 있으면 Compose 소유자가 `infra/postgres`이고
데이터 볼륨이 `infra_postgres-data`인지 확인합니다. 값이 다르면 배포를 중단합니다. 워크플로는
`docker compose down -v`나 `--remove-orphans`를 사용하지 않습니다.

Compose 경계와 필수 값은 다음 명령으로 로컬 검증할 수 있습니다.

```bash
bash infra/tests/compose-config.sh
```

이 문서는 저장소 파일 기준의 운영 설계를 설명합니다. 기본 레거시 리소스 이름은 Compose
프로젝트명에서 파생되고 런타임에서 가드하지만, 원격 운영 서버 상태를 직접 검증한 결과는
아닙니다.
