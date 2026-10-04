# ADR 0015. dev와 prod를 별도 EC2로 나누고 데이터베이스는 RDS 한 대에서 계정으로 나눈다

- 상태: 제안
- 날짜: 2026-10-05
- 관련 문서: [백엔드 ADR 목록](README.md),
  [배포 토폴로지 ADR](0009-aws-deployment-topology.md),
  [PostgreSQL 선택 ADR](0011-postgresql-rdbms-selection.md),
  [스키마 관리 ADR](0012-database-schema-management.md),
  [CloudWatch 관찰 플랫폼 ADR](0014-cloudwatch-observability-platform.md),
  [운영 Docker Compose](../../../infra/docker-compose.yml),
  [개발 Docker Compose](../../../infra/docker-compose.dev.yml),
  [백엔드 운영 배포 워크플로](../../../.github/workflows/backend-prod-deploy.yml),
  [백엔드 개발 배포 워크플로](../../../.github/workflows/backend-dev-deploy.yml)

## 배경

[백엔드 ADR 0009](0009-aws-deployment-topology.md)는 제한된 크레딧과 권한 안에서 백엔드, PostgreSQL과
self-hosted runner를 EC2 한 대에 두기로 했다. 2026-09-29에는 같은 EC2에 개발 백엔드와 개발
PostgreSQL을 별도 Compose project로 추가했다. 그 결과 t4g.medium(메모리 4 GiB) 한 대에서 상시
컨테이너 네 개와 runner의 이미지 빌드가 메모리를 나눠 쓰게 되었다.

2026-09-30에 이 EC2에서 메모리 고갈(OutOfMemory)이 발생했다. 작성 중인 장애 보고서는 컨테이너에
메모리 상한이 없고 두 JVM이 각자 호스트 메모리 전체를 기준으로 힙을 잡는 구조라, 배포 중 빌드가 겹치면
합계가 물리 메모리를 넘을 수 있다고 분석한다. 개발 환경 때문에 늘어난 사용량이 운영 프로세스를
멈추게 할 수 있는 구조다.

레벨 4에서는 개발 환경에서 모의 장애 훈련을 해야 한다. 같은 EC2에서는 자원 고갈 같은 훈련이 운영에
그대로 영향을 준다. 또한 ADR 0009가 감수한 비용 가운데 데이터베이스 백업과 복구를 직접 설계해야
한다는 점은 아직 해결되지 않았다.

## 결정

### 1. dev와 prod 백엔드를 별도 EC2에서 실행한다

- 새 EC2 두 대를 만들어 하나는 dev, 하나는 prod 백엔드에 쓴다. 둘 다 **t4g.small**(vCPU 2, 메모리
  2 GiB), Ubuntu ARM64로 만든다. 기존 workflow의 `ARM64` runner 조건과 CloudWatch 설치
  스크립트의 Ubuntu ARM64 전제를 유지한다. 학생 계정 정책(`ec2-restrict-student`)에서 x86
  인스턴스 생성이 거부되었으므로(2026-10-05 확인) ARM64는 선택이 아니라 전제다.
- 두 EC2 모두 API를 호스트 8080에 매핑한다. 개발 API가 호스트 80을 쓴 것은 EC2 한 대를 공유할
  때의 포트 충돌과 보안 그룹 제약 때문이었으므로 서버를 나누면서 운영과 맞춘다. 관리 엔드포인트는
  계속 localhost에만 바인딩한다.
- 각 EC2에 self-hosted runner를 하나씩 두고 기본 라벨 없이 `jarihana-dev`, `jarihana-prod` 전용
  라벨만 붙인다. 배포 workflow는 이 라벨로 실행 서버를 고른다. `environment`는 시크릿을 고를 뿐 실행
  서버를 고르지 않는다.
- CloudFront가 Origin에 접속하고 runner가 GitHub에 접속해야 하므로 두 EC2에는 퍼블릭 IP를 둔다.

### 2. 데이터베이스는 RDS for PostgreSQL 한 대에서 dev와 prod DB를 나눈다

- RDS for PostgreSQL 17 인스턴스 한 대(db.t4g.micro, Single-AZ, gp3 20 GiB)를 비공개로 만든다.
  기존 DB가 PostgreSQL 17이므로 그보다 낮은 버전은 쓰지 않는다.
- 인스턴스 안에 `jarihana_dev`와 `jarihana_prod` DB를 두고, 각 DB의 소유자를 같은 이름의 앱 계정으로
  한다. 두 DB 모두 `PUBLIC`의 `CONNECT` 권한을 회수한다. master 계정은 GitHub Environment에 넣지
  않는다.
- 접속은 RDS의 EC2 연결 기능이 만드는 보안 그룹으로 EC2에서만 허용한다. 보안 그룹은 인스턴스 단위로만
  막으므로 dev와 prod DB 사이의 격리는 PostgreSQL 계정과 권한이 맡는다.
- Compose에서 PostgreSQL 서비스와 볼륨을 제거하고, `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`를
  환경별 GitHub Environment에서 주입한다.

### 3. 공개 진입점은 그대로 둔다

기존 운영 CloudFront와 도메인, 개발 CloudFront를 유지하고 각 배포판의 `/api/*` Origin 도메인만 새
EC2로 바꾼다. 운영 배포판은 CloudFront Function이 Origin 이름 `jarihana-backend`로 백엔드를
고르므로 새 Origin을 추가하지 않고 기존 Origin의 도메인만 바꾼다.

### 4. 이미지는 당분간 서버마다 빌드한다

서버 이전 동안에는 지금처럼 각 서버의 runner가 이미지를 빌드한다. 레지스트리, 인증, 롤백을 서버
이전과 동시에 바꾸면 실패 지점이 너무 많다. dev에서 검증한 이미지를 prod로 옮기는 방식은 서버 이전이
안정된 뒤 별도로 도입한다.

### 5. 운영 데이터 이전은 따로 진행한다

기존 EC2에는 SSH와 Session Manager로 접근할 수 없고, 기존 runner를 통한 workflow 실행만 가능하다.
운영 데이터 이전은 접근 경로와 점검 시간을 확보한 뒤 별도로 진행하며, 그동안 운영은 기존 EC2에서
계속 실행한다. 이전 전까지 기존 runner는 제거하지 않는다.

## 선택 이유

- **장애 영역 분리:** 개발 배포와 빌드, 장애 훈련이 운영 EC2의 CPU와 메모리를 쓰지 않는다.
  9월 30일 장애처럼 개발 쪽 사용량이 운영 프로세스를 멈추게 하는 경로가 사라진다.
- **관리형 백업:** RDS의 자동 백업과 시점 복구로 ADR 0009가 남긴 데이터베이스 백업 과제를 직접 운영하지
  않고 해결한다.
- **비용:** 데이터는 텍스트와 S3 키뿐이고 이미지는 S3에 있다. RDS를 환경마다 두지 않고 한 대에 DB 두
  개를 두면 인스턴스 비용이 한 대분이다. 20 GiB는 PostgreSQL gp3 스토리지의 최솟값이다.
- **EC2 사양:** DB가 RDS로 빠지면 각 EC2에는 backend 컨테이너 하나와 runner만 남는다. 장애 보고서의
  추정으로는 backend JVM이 0.6~1.4 GiB, OS와 Docker와 runner가 0.3~0.5 GiB이고, 배포 중 Gradle
  빌드가 0.5~1.5 GiB를 더한다. micro(1 GiB)는 backend만으로 한계에 닿고 서버 빌드가 겹치면 거의
  확실히 부족하다. medium(4 GiB)은 컨테이너 네 개를 감당하던 크기라 컨테이너 하나에는 크다. small은
  서버 빌드를 유지하는 기간에 필요한 여유와 비용 사이의 출발점이다. 이 수치는 측정값이 아니므로 첫
  배포에서 확인한다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 같은 EC2에서 dev와 prod 유지(현행) | 추가 비용이 없고 이미지를 로컬에서 공유한다 | 메모리 고갈 장애가 이미 발생했다. 개발 훈련과 빌드가 운영에 영향을 준다 |
| EC2 두 대에 각자 PostgreSQL 컨테이너 | RDS 비용이 없고 dev와 prod DB가 서버 수준에서 완전히 분리된다 | 백업과 복구를 계속 직접 운영해야 한다. EC2마다 DB 메모리가 더해져 사양을 올려야 한다 |
| RDS를 dev와 prod 각각 한 대씩 | DB 서버의 CPU, 메모리, I/O와 재시작 영향까지 분리된다 | 데이터 규모에 비해 인스턴스 비용이 두 배다 |
| Multi-AZ RDS | AZ 장애 때 대기 인스턴스로 자동 전환한다 | 비용이 두 배 이상이고, 현재 가용성 요구에 비해 크다 |
| EC2 t4g.micro | 비용이 가장 낮다 | 서버에서 이미지를 빌드하는 동안 메모리가 부족할 가능성이 높다 |
| EC2 t4g.medium | 메모리 여유가 크다 | 컨테이너 하나를 돌리는 서버에는 크다. 부족이 확인되면 그때 올린다 |
| 처음부터 레지스트리로 이미지 승격 | dev에서 검증한 이미지를 그대로 운영에 쓴다 | 현재 운영 버전 이미지가 레지스트리에 없어 새 운영 서버의 첫 배포에 쓸 이미지가 없다. 서버 이전과 동시에 바꿀 부분이 너무 많다 |

## 제약과 전제

- 학생 계정의 EC2 생성은 `ec2-restrict-student` 정책의 명시적 거부를 받는다. x86 인스턴스는
  생성되지 않고 ARM64 인스턴스는 생성된다. 정책의 전체 조건은 조회 권한이 없어 확인하지 못했다.
- 새 EC2, RDS, 보안 그룹, IAM Role, Elastic IP를 만들 권한이 필요하다. ADR 0009에는 보안 그룹을
  구성할 권한이 없었다고 기록되어 있다. RDS의 EC2 연결 기능도 보안 그룹을 만든다.
- 환경별 IAM Role을 만들 수 없으면 기존 Role을 재사용하며, 이때 dev가 운영 S3 경로에 접근할 수 있다.
- RDS 한 대를 공유하므로 DB 서버의 CPU, 메모리, I/O와 재시작은 dev와 prod가 함께 겪는다.
  db.t4g는 Unlimited 모드라 CPU를 오래 높게 쓰면 추가 요금이 붙는다.
- Single-AZ이므로 인스턴스나 AZ 장애, 클래스 변경 같은 유지 관리 동안 dev와 prod DB가 함께 중단된다.
- EC2는 여전히 퍼블릭 주소로 Origin을 우회해 직접 접근할 수 있고, CloudFront와 EC2 사이는 HTTP다.
- t4g.small에서도 JVM 힙에 상한이 없으면 빌드와 겹칠 때 메모리가 부족할 수 있다.

## 결과

### 긍정적인 결과

- 개발 환경의 배포, 빌드와 장애 훈련이 운영 EC2 자원을 쓰지 않는다.
- 데이터베이스 백업과 시점 복구를 RDS가 맡는다.
- dev와 prod 배포 workflow가 같은 포트와 같은 Compose 구조를 쓰게 된다.
- runner 전용 라벨로 배포가 엉뚱한 서버에서 실행되는 일을 막는다.

### 감수하는 비용

- EC2 한 대와 RDS 한 대만큼 상시 비용이 늘어난다.
- dev 부하나 RDS 유지 관리가 운영 DB에 영향을 줄 수 있다.
- 기존 EC2의 개발 DB 컨테이너를 멈추는 장애 훈련은 RDS에서 그대로 쓸 수 없다.
- 운영 데이터 이전 전까지 운영은 접근 수단이 제한된 기존 EC2에 남는다.
- 서버마다 빌드하는 동안 dev와 prod가 같은 이미지를 쓴다는 보장이 없다.

## 후속 작업

- 이 ADR이 채택되면 [백엔드 ADR 0009](0009-aws-deployment-topology.md)의 단일 EC2와 RDS 미채택
  결정, 2026-09-30 기록의 개발 API 80 포트를 대체 관계로 표시한다.
- [프로젝트 운영 컨벤션](../conventions/project-operations.md)의 공유 개발 환경 문구와
  [백엔드 README](../../README.md)의 DB 터널, 공유 개발 환경, 배포 환경 설정을 고친다.
- Compose에 JVM 힙 상한과 메모리 제한을 두고, 서버에 스왑 파일을 둘지 정한다. 첫 dev 배포에서 빌드 중
  메모리를 측정해 사양을 확인한다.
- dev DB 베이스라인을 기존 runner의 수동 실행 workflow로 추출하고, 저장소에 둘지
  [백엔드 ADR 0012](0012-database-schema-management.md)에서 정한다.
- 운영 데이터 이전 절차(리허설, 쓰기 차단, 최종 복원, Origin 교체, 복귀 기준)를 런북으로 만든다.
- 서버 이전이 안정되면 레지스트리를 통한 이미지 승격과 자동 롤백을 별도 결정으로 도입한다.
- CloudWatch 수집 설정, 대시보드와 알람의 대상 인스턴스, 개발 DB 장애 훈련을 새 구성에 맞춘다.

## 적용하지 않는 범위

이 결정은 다음을 의미하지 않는다.

- RDS 한 대가 dev와 prod DB를 서버 수준에서 격리한다.
- Single-AZ RDS가 고가용성을 제공한다.
- t4g.small이 측정 없이 충분하다고 확정한다.
- CloudFront를 거치지 않는 EC2 직접 접근이 차단된다.
