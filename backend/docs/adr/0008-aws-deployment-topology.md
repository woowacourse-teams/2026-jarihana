# ADR 0008. 제한된 AWS 환경에서 단일 진입점과 단일 EC2를 사용한다

- 상태: 채택
- 날짜: 2026-08-25
- 관련 문서: [프로젝트 운영 컨벤션](../conventions/project-operations.md),
  [모노레포와 인프라 경계 ADR](0007-monorepo-application-infrastructure-boundaries.md),
  [프론트엔드 운영 배포 전제](../../../frontend/README.md#운영-배포-전제),
  [운영 Docker Compose](../../../infra/docker-compose.yml),
  [백엔드 Dockerfile](../../Dockerfile),
  [백엔드 배포 워크플로](../../../.github/workflows/backend-build.yml),
  [Access Token 쿠키 ADR](0002-access-token-cookie.md),
  [OAuth 인가 요청 소유권 ADR](0003-oauth-authorization-ownership.md),
  [CSRF Token 전달 ADR](0004-csrf-token-delivery.md)

## 배경

자리하나는 우아한테크코스에서 제공한 제한된 AWS 크레딧과 권한 안에서 MVP를 운영해야 했다.
RDS, 별도 배포 서버와 같은 관리형 또는 전용 자원을 추가하면 각 자원의 비용과 운영 지점이
늘어난다. 반면 프론트엔드, 백엔드와 데이터베이스를 모두 하나의 EC2에서 직접 제공하면 정적
파일을 위해 Nginx와 같은 웹 서버를 추가로 운영해야 하고 애플리케이션별 배포 경계도 흐려진다.

프론트엔드와 백엔드는 쿠키 기반 인증, CSRF와 GitHub OAuth 흐름을 사용한다. 백엔드에는 운영
CORS 설정이 없으므로 브라우저가 프론트엔드와 API를 하나의 Origin으로 인식할 수 있는 공개
진입점이 필요했다.

또한 GitHub-hosted Runner가 사용하는 외부 네트워크에서 운영 EC2로 SSH 접속할 수 있도록
우테코 AWS 환경을 변경할 권한이 없었다. 외부 Runner에서 SSH로 배포하는 일반적인 방식 대신,
운영 EC2에서 GitHub Actions 작업을 실행할 배포 경로가 필요했다.

이 ADR은 팀이 채택한 배포 구성을 사후에 기록한다. Docker Compose와 백엔드 배포 워크플로는
저장소에서 확인하고, 저장소에 없는 S3와 CloudFront 구성은 팀이 확인한 운영 사실을 근거로
기록한다. 모든 AWS 환경에 적용할 일반적인 권장 구성이 아니라, 당시의 크레딧·권한과 MVP
규모에서 선택한 운영 경계와 감수한 위험을 설명한다.

## 결정

CloudFront를 서비스의 기본 공개 진입점으로 사용하고 경로에 따라 Origin을 구분한다.

```text
사용자
  |
  | HTTPS
  v
CloudFront
  |-- 기본 경로 ------> S3
  |                     프론트엔드 정적 파일
  |
  `-- /api/* ---------> EC2:8080
                        |-- Backend 컨테이너
                        |-- PostgreSQL 컨테이너
                        `-- self-hosted GitHub Actions Runner
```

- 사용자와 CloudFront 사이는 HTTPS를 사용한다.
- CloudFront는 기본 경로를 S3 Origin으로 전달하여 프론트엔드 정적 파일을 제공한다.
- CloudFront는 `/api/*` 경로를 퍼블릭 EC2 Origin의 `8080` 포트로 HTTP 전달한다.
- CloudFront의 경로 기반 Origin 라우팅으로 프론트엔드와 API를 브라우저 관점의 단일 Origin으로
  제공한다.
- 백엔드와 PostgreSQL은 하나의 EC2에서 서로 다른 Docker 컨테이너로 실행한다.
- PostgreSQL은 호스트 포트를 공개하지 않고 Compose 내부 네트워크에서만 백엔드와 통신한다.
- PostgreSQL 데이터는 Docker Named Volume에 저장한다.
- 같은 EC2에 self-hosted GitHub Actions Runner를 호스트 서비스로 설치한다.
- 백엔드 배포 작업은 해당 Runner가 백엔드 이미지를 로컬에서 빌드한 뒤 운영 Docker Compose를
  실행하는 방식으로 수행한다.
- 프론트엔드 빌드 결과물의 S3 배포는 현재 수동으로 수행하고 이후 GitHub Actions로 자동화한다.

CloudFront는 여기에서 공개 진입점과 정적 콘텐츠 캐시 계층의 역할을 한다. CloudFront가 모든
리버스 프록시 기능을 대신하거나 전체 서비스의 고가용성을 보장한다는 의미는 아니다.

## 선택 이유

### 정적 프론트엔드를 S3와 CloudFront에서 제공한다

프론트엔드는 독립적으로 빌드되는 정적 애플리케이션이다. 이를 EC2에서 제공하려면 Nginx와 같은
웹 서버 또는 별도 컨테이너를 추가하고 프론트엔드 배포를 위해 해당 런타임도 관리해야 한다.

CloudFront와 S3에 정적 파일 제공을 맡기면 프론트엔드를 위해 EC2의 실행 프로세스를 늘리지
않아도 된다. 또한 정적 콘텐츠 캐시와 배포 책임 일부를 AWS 관리형 자원에 맡길 수 있다. 다만
이는 정적 파일 제공 계층의 운영 부담을 줄인다는 의미이며, 단일 EC2에 있는 백엔드와
데이터베이스까지 고가용성이 된다는 의미는 아니다.

### 백엔드와 PostgreSQL을 하나의 EC2에서 격리한다

MVP 규모에서 EC2와 RDS를 각각 운영하면 제한된 크레딧을 여러 상시 자원에 사용해야 한다.
백엔드와 PostgreSQL을 하나의 EC2에 배치하되 Docker 컨테이너와 Compose 네트워크로 실행 경계를
구분하면 추가 서버 비용 없이 애플리케이션과 데이터베이스 프로세스를 분리할 수 있다.

이 선택은 관리형 데이터베이스의 자동 백업, 장애 조치와 독립 확장을 포기하는 대신 비용과 초기
운영 복잡도를 줄인다.

### GitHub-hosted Runner 대신 self-hosted Runner를 사용한다

우테코 AWS 네트워크 정책에서는 GitHub-hosted Runner의 외부 IP에서 운영 EC2로 SSH 접속하는
배포 경로를 사용할 수 없었다. self-hosted Runner는 운영 EC2에서 GitHub Actions로 아웃바운드
연결한 뒤 같은 호스트의 Docker 명령과 Compose 파일을 직접 실행하므로 별도의 인바운드 SSH
배포 경로가 필요하지 않다.

### Runner를 컨테이너가 아닌 호스트 서비스로 실행한다

컨테이너 Runner가 호스트의 Docker를 제어하려면 Docker Socket을 마운트하거나
Docker-in-Docker, 내부 원격 실행과 같은 추가 구성이 필요하다. 이 방식들은 Docker 제어 권한과
네트워크·볼륨 구성을 별도로 관리해야 한다.

Runner를 호스트 서비스로 설치하면 체크아웃, 이미지 빌드와 Compose 실행을 같은 환경에서
단순하게 연결할 수 있다. 이는 우테코의 외부 SSH 제한 때문이 아니라 동일 EC2 안에서 배포
구성을 단순하게 유지하기 위한 별도의 선택이다.

### Runner 전용 서버를 분리하지 않는다

Runner는 배포 작업이 실행될 때만 주로 사용된다. 이를 위해 별도의 EC2를 상시 운영하면 한정된
크레딧을 간헐적인 작업에 사용하게 된다. 서버를 분리하면 빌드 이미지를 전달할 레지스트리와
인증 정보 또는 별도의 원격 배포 경로도 필요하다. 따라서 현재 규모에서는 Runner를 배포 대상
EC2에 함께 두는 편이 운영 요소가 적다고 판단했다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 프론트엔드도 EC2와 Nginx에서 제공 | 모든 실행 요소를 한 서버에서 확인할 수 있다 | 정적 파일 제공을 위해 웹 서버 또는 컨테이너와 프론트엔드 배포 관리 지점이 추가된다. 이미 사용하는 S3와 CloudFront의 정적 제공·캐시 역할을 중복한다. |
| RDS와 별도 애플리케이션 서버 사용 | 데이터베이스 백업, 장애 조치와 자원 격리가 쉬워진다 | 제한된 크레딧과 권한, MVP 규모에 비해 상시 비용과 운영 요소가 커진다. |
| GitHub-hosted Runner에서 EC2로 SSH 배포 | 운영 서버에 Runner를 설치하지 않아도 된다 | GitHub-hosted Runner의 외부 네트워크에서 운영 EC2로 SSH 접속할 수 있도록 우테코 AWS 환경을 변경할 권한이 없었다. |
| self-hosted Runner를 같은 EC2의 컨테이너로 실행 | Runner 설치와 버전을 이미지로 관리할 수 있다 | 호스트 Docker 제어를 위한 Socket 마운트, Docker-in-Docker 또는 내부 원격 실행 구성이 필요해 현재 배포보다 권한과 운영 구성이 복잡해진다. |
| Runner 전용 EC2와 이미지 레지스트리 사용 | 빌드 작업과 운영 애플리케이션의 자원·권한을 분리할 수 있다 | 간헐적인 배포 작업을 위해 서버를 상시 운영해야 하며 레지스트리 인증, 이미지 전달과 원격 배포 절차가 추가된다. |

## 제약과 전제

- CloudFront를 기본 진입점으로 사용하지만 EC2 Origin은 퍼블릭 주소와 `8080` 포트로도 직접
  접근할 수 있다.
- 별도 Security Group을 구성할 권한이 없어 CloudFront를 거치지 않는 Origin 우회 접근을
  차단하지 못했다.
- CloudFront와 EC2 사이는 퍼블릭 네트워크에서 HTTP를 사용하므로 Origin 구간의 전송 암호화가
  제공되지 않는다.
- CloudFront는 엣지에서 정적 요청을 캐시하고 일부 트래픽을 Origin 전에 처리할 수 있지만,
  DDoS 방어를 완전히 보장하지 않는다. 특히 공개 EC2 Origin은 직접 요청에 노출되어 있다.
- 백엔드, PostgreSQL과 Runner가 하나의 EC2 자원과 장애 영역을 공유한다.
- self-hosted Runner는 운영 서버의 Docker를 제어하므로 Runner 또는 허용된 워크플로가
  침해되면 운영 컨테이너와 호스트에 미치는 영향이 크다.
- Docker Named Volume은 EC2 내부 데이터 지속성을 제공하지만 관리형 백업이나 다중 가용 영역
  장애 조치를 제공하지 않는다.
- S3, CloudFront와 Security Group 설정은 AWS 콘솔에서 수동으로 관리하며 저장소가 완전한 IaC
  원본은 아니다.
- ADR 작성 시점에는 S3 버킷이 CloudFront만 접근할 수 있는 비공개 구성인지, 객체 URL로도 직접
  접근할 수 있는 구성인지 확인하지 못했다.
- 프론트엔드 S3 배포는 수동이므로 백엔드 배포 워크플로와 자동화 수준이 다르다.

## 결과

### 긍정적인 결과

- CloudFront의 경로 기반 Origin 라우팅으로 프론트엔드와 API를 하나의 공개 Origin에서 제공할
  수 있다.
- 별도 CORS 구성을 추가하지 않고 현재의 쿠키, CSRF와 OAuth 흐름을 유지할 수 있다.
- 정적 프론트엔드를 위해 EC2에 Nginx나 별도 런타임 컨테이너를 추가하지 않는다.
- RDS와 Runner 전용 서버 없이 제한된 크레딧으로 서비스를 운영할 수 있다.
- 외부 SSH 배포 경로와 이미지 레지스트리 없이 같은 EC2에서 백엔드 이미지를 빌드하고 배포할
  수 있다.
- 프론트엔드 정적 배포와 백엔드 런타임 배포를 독립적으로 수행할 수 있다.

### 감수하는 비용

- EC2 장애가 발생하면 백엔드, 데이터베이스와 자동 배포 경로가 함께 중단된다.
- 백엔드와 Runner의 빌드 작업이 CPU, 메모리와 디스크를 공유하여 배포 중 서비스 성능에 영향을
  줄 수 있다.
- 데이터베이스 장애 복구와 백업을 직접 설계하고 운영해야 한다.
- Runner가 운영 호스트의 Docker를 제어하므로 권한 분리와 침해 범위가 크다.
- 퍼블릭 EC2 Origin을 우회한 직접 요청과 암호화되지 않은 Origin 연결을 허용한다.
- 수동 AWS 설정이 Git 이력에 남지 않아 실제 환경과 문서 사이에 차이가 생길 수 있다.
- 프론트엔드 배포가 수동이므로 배포 재현성과 변경 추적이 제한된다.

## 후속 작업

- 프론트엔드 빌드 결과물의 S3 업로드와 CloudFront 캐시 무효화를 GitHub Actions로 자동화한다.
- S3 버킷의 퍼블릭 접근 차단, CloudFront Origin 접근 방식과 직접 객체 접근 가능 여부를 확인해
  운영 문서에 기록한다.
- CloudFront의 Origin, Behavior, 캐시 정책과 오류 응답 설정을 저장소 운영 문서에 기록한다.
- 필요한 AWS 권한이 확보되면 CloudFront를 통한 요청만 EC2 Origin에 도달하도록 네트워크 접근
  제한 방식을 재검토한다.
- Origin 구간의 HTTPS 적용 가능성을 검토한다.
- PostgreSQL 데이터의 백업·복구 절차를 만들고 실제 복구 가능 여부를 주기적으로 검증한다.
- self-hosted Runner가 실행할 수 있는 저장소, 브랜치와 워크플로 권한을 최소화하고 운영 서버와
  Docker 접근 위험을 점검한다.
- 배포 중 자원 경합이 실제 문제로 확인되거나 비용·가용성 요구가 높아지면 Runner, 데이터베이스와
  애플리케이션 서버 분리를 새로운 ADR로 검토한다.

## 적용하지 않는 범위

이번 결정은 다음을 의미하지 않는다.

- 단일 EC2가 고가용성 구성을 제공한다.
- CloudFront가 EC2 Origin의 직접 접근 또는 모든 DDoS 공격을 차단한다.
- Docker 컨테이너가 서버 수준의 장애 격리를 제공한다.
- Named Volume만으로 데이터베이스 백업과 복구가 보장된다.
- self-hosted Runner를 운영 서버에 배치하는 방식이 모든 환경에서 더 안전하다.
- 현재의 수동 AWS 설정을 장기적인 최종 상태로 유지한다.
