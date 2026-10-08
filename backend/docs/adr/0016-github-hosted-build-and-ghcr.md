# ADR 0016. 백엔드 이미지를 GitHub 호스팅 runner에서 빌드하고 GHCR로 전달한다

- 상태: 제안
- 날짜: 2026-10-08
- 관련 문서: [백엔드 ADR 목록](README.md),
  [배포 토폴로지 ADR](0009-aws-deployment-topology.md),
  [EC2 분리와 RDS ADR](0015-separate-ec2-and-shared-rds.md),
  [백엔드 개발 배포 워크플로](../../../.github/workflows/backend-dev-deploy.yml),
  [개발 Docker Compose](../../../infra/docker-compose.dev.yml)

## 배경

[백엔드 ADR 0015](0015-separate-ec2-and-shared-rds.md)는 dev와 prod 백엔드를 t4g.small(메모리 2 GiB)
EC2 두 대로 나누면서, 결정 4에서 이미지는 당분간 각 서버의 runner가 빌드하기로 했다. 같은 ADR의
추정으로는 backend JVM이 0.6~1.4 GiB를 쓰고 배포 중 Gradle 빌드가 0.5~1.5 GiB를 더한다. 2026-09-30
메모리 고갈 장애의 원인 가운데 하나도 실행 중인 컨테이너와 서버 빌드가 메모리를 함께 쓴 것이었다.

인프라 담당은 빌드를 서버 밖으로 옮기기 위해 CodePipeline(CodeBuild, CodeDeploy) 도입을 준비했다.
서버 밖 빌드 외에 EC2마다 runner를 두는 관리 부담과 자동 롤백도 이유였다. 준비하는 동안 다음 제약이
드러났다(2026-10-08 확인).

- GitHub Environment의 Secrets와 Variables는 GitHub Actions가 실행되는 동안에만 읽을 수 있다.
  CodePipeline은 GitHub에서 코드만 가져오므로 CodeDeploy가 이 값을 받을 경로가 없다.
- 학생 계정에서는 Parameter Store와 Secrets Manager를 쓸 수 없다. 따라서 CodePipeline을 쓰려면
  백엔드 실행 값을 서버마다 둔 환경 파일이나 직접 운영하는 저장소(예: Vault EC2)로 옮겨야 한다.
- 팀은 서버의 `.env` 같은 민감 파일 관리에서 문제를 겪은 뒤 실행 값을 GitHub Environment로 모았다.
  값을 다시 서버나 다른 저장소로 옮기면 이 결정을 되돌리게 된다.
- CodePipeline의 GitHub 연결(GitHub 앱) 생성이 학생 계정에서 거부되었다. 다른 팀이 쓰는 OAuth 소스는
  파일 경로 필터를 지원하지 않는다.

CodePipeline을 검토할 당시에는 GitHub Container Registry(GHCR)를 고려하지 않았다. GitHub 호스팅
runner는 워크플로의 `GITHUB_TOKEN`만으로 이미지를 빌드해 GHCR에 올릴 수 있고, 서버는 그 이미지를 받아
실행만 하면 된다. 이 방식은 빌드를 서버 밖으로 옮기면서 실행 값은 GitHub Environment에 그대로 둔다.

## 결정

### 1. 백엔드 이미지는 GitHub 호스팅 ARM runner에서 빌드한다

- 빌드 job은 `ubuntu-24.04-arm`에서 실행한다. EC2가 ARM64이므로 같은 아키텍처에서 빌드한다.
  저장소가 공개 저장소라 이 runner에 추가 비용이 없다(2026-10-08 확인).
- 빌드 job에는 Environment를 붙이지 않는다. 받는 권한은 `contents: read`와 `packages: write`뿐이며,
  실행 값 시크릿은 빌드 job에 들어가지 않는다.

### 2. 이미지는 GHCR에 커밋 SHA 태그로 올린다

- dev 이미지는 `ghcr.io/woowacourse-teams/jarihana-backend-dev:<커밋 SHA>`다. 태그는 지금처럼
  `BACKEND_TAG`가 되어 `APP_VERSION`과 로그 태그로 이어진다.
- 이미지에 `org.opencontainers.image.source` 라벨로 저장소를 기록해 GHCR 패키지를 저장소에 연결한다.
  같은 저장소의 `GITHUB_TOKEN`이 push와 pull 권한을 얻는다.

### 3. 서버의 runner는 이미지를 받아 교체만 한다

- [백엔드 ADR 0015](0015-separate-ec2-and-shared-rds.md) 결정 1의 runner와 전용 라벨(`jarihana-dev`,
  `jarihana-prod`)을 그대로 쓴다.
- 배포 job은 `packages: read` 권한의 `GITHUB_TOKEN`으로 GHCR에서 이미지를 받고, GitHub Environment의
  값을 주입해 Compose로 컨테이너를 교체한 뒤 기존 배포 후 점검을 실행한다. 끝나면 GHCR에서 로그아웃한다.
- 서버에 남는 이미지는 이 저장소 라벨이 붙은 것 중 일주일이 지나고 실행 중이 아닌 것을 지운다. 이전
  버전은 GHCR에 남아 있다.

### 4. 되돌리기는 이미지 태그를 지정한 수동 실행으로 한다

수동 실행에 `image_tag`로 이전 커밋 SHA를 넣으면 빌드 job을 건너뛰고 그 이미지로 다시 배포한다.
배포 후 점검이 실패했을 때 직전 이미지로 자동으로 되돌리는 단계는 아직 두지 않는다.

### 5. dev부터 적용하고 prod는 운영 데이터 이전 때 바꾼다

이 결정은 dev 배포 워크플로에 먼저 적용한다. prod는 운영 데이터 이전과 함께 같은 구조
(`ghcr.io/woowacourse-teams/jarihana-backend`)로 바꾼다. dev에서 검증한 이미지를 prod로 그대로
승격할지는 이 ADR에서 정하지 않는다.

## 선택 이유

- **원래 문제를 가장 작게 푼다:** 서버 빌드의 메모리 부담이 사라진다. 바뀌는 것은 워크플로 한 개와
  Compose의 이미지 이름뿐이고, 이미 준비된 runner, Environment 값, RDS 구성을 그대로 쓴다.
- **실행 값의 원본이 하나로 남는다:** 값은 지금처럼 GitHub Environment에만 있다. 서버에 민감 파일을
  두지 않고, 같은 값을 두 곳에서 관리하지 않는다.
- **새로 운영할 것이 없다:** Vault 서버, CodeDeploy agent, 콘솔에만 있는 파이프라인 설정이 생기지 않는다.
  배포 경로 전체가 저장소의 워크플로에 남아 PR로 검토된다.
- **학생 계정 권한과 부딪히지 않는다:** IAM 역할, GitHub 연결, AWS 자격 증명 없이 `GITHUB_TOKEN`만 쓴다.
- **이미지가 레지스트리에 남는다:** 이전 버전을 빌드 없이 다시 배포할 수 있고, 나중에 dev에서 검증한
  이미지를 prod로 승격하는 기반이 된다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 서버마다 빌드 유지(ADR 0015 결정 4) | 바꿀 것이 없다 | t4g.small에서 실행과 빌드가 메모리를 나눠 쓴다. 장애 원인 하나가 그대로 남는다 |
| CodePipeline과 서버 환경 파일 | 서버 밖 빌드, CodeDeploy 자동 롤백, runner 없음 | 실행 값이 서버마다 둔 민감 파일로 돌아간다. GitHub Environment로 모은 결정을 되돌린다 |
| CodePipeline과 Vault EC2 | 위 장점에 더해 실행 값의 원본이 한 곳이다 | Vault 서버의 잠금 해제, 백업, 인증서, 서버 인증을 새로 운영해야 한다. GitHub Secrets는 다시 읽을 수 없어 일부 값은 원본을 찾거나 재발급해야 한다 |
| CodePipeline과 GitHub Actions OIDC | GitHub Environment를 유지하면서 runner를 없앤다 | OIDC 공급자와 역할을 만들어야 하는데 학생 계정은 IAM 조회부터 막혀 있어 운영 담당의 작업이 필요하다 |
| Amazon ECR | AWS 안에서 이미지를 전달하고 CodeDeploy와 잘 맞는다 | GitHub Actions에서 push하려면 AWS 자격 증명이 필요하고, EC2 역할의 ECR 권한도 확인되지 않았다 |
| Docker Hub | 널리 쓰인다 | 별도 계정과 접근 토큰을 GitHub Secrets로 관리해야 한다 |

## 제약과 전제

- 저장소가 비공개로 바뀌면 ARM 호스팅 runner 사용량과 비용을 다시 확인한다.
- 조직 설정이 패키지 생성을 제한하면 첫 push가 거부될 수 있다. 첫 실행의 빌드 로그에서 확인한다.
- 워크플로는 `develop`에서만 실행되므로 병합 전에는 실제 배포로 검증할 수 없다.
- 서버의 runner는 여전히 서버의 Docker를 제어한다. [백엔드 ADR 0009](0009-aws-deployment-topology.md)가
  감수한 runner 침해 위험은 줄지 않는다.
- 빌드는 빠지지만 Compose에 JVM 힙 상한과 메모리 제한이 없는 상태는 그대로다.

## 결과

### 긍정적인 결과

- 서버는 이미지를 빌드하지 않고 받아서 실행만 한다.
- 실행 값의 원본이 GitHub Environment 하나로 유지된다.
- 커밋 SHA 태그 이미지로 이전 버전을 빌드 없이 다시 배포할 수 있다.
- 빌드 job에 실행 값 시크릿이 들어가지 않는다.

### 감수하는 비용

- EC2마다 runner를 하나씩 운영하는 관리 지점이 남는다.
- 배포 후 점검이 실패해도 자동으로 되돌리지 않는다. 되돌리기는 사람이 수동 실행으로 한다.
- GHCR에 이미지가 계속 쌓이므로 보존 기간을 정해야 한다.
- GitHub에 장애가 나면 빌드와 배포가 함께 멈춘다. 이는 지금의 runner 방식과 같다.

## 후속 작업

- 이 ADR이 채택되면 [백엔드 ADR 0015](0015-separate-ec2-and-shared-rds.md)의 결정 4(서버마다 빌드)와
  후속 작업의 레지스트리 항목을 이 ADR로 대체했다고 표시한다.
- prod 배포 워크플로를 운영 데이터 이전 때 같은 구조로 바꾼다.
- 배포 후 점검이 실패하면 직전 이미지 태그로 다시 배포하는 단계를 워크플로에 넣는다.
- GHCR 패키지의 오래된 태그를 정리하는 기준을 정한다.
- dev에서 검증한 이미지를 prod로 승격하는 방식을 검토한다.
- runner 관리 부담이나 보안 요구가 커지면 CodePipeline 안을 다시 검토한다. 그때는 실행 값을 어디에 둘지가
  먼저 풀려야 한다.

## 적용하지 않는 범위

이 결정은 다음을 의미하지 않는다.

- dev에서 검증한 이미지를 prod에 그대로 올린다.
- self-hosted runner의 보안 위험이 줄어든다.
- CodePipeline이나 Vault를 앞으로 쓰지 않는다.
