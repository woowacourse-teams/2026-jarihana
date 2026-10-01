# 애플리케이션 로깅 운영 가이드

## 출력과 범위

| 프로필 | stdout 형식 | 서비스 환경 | SQL 직접 출력 |
| --- | --- | --- | --- |
| `local` | Spring Boot 기본 텍스트 | 해당 없음 | 기존 로컬 설정 유지 |
| `dev` | Spring Boot 네이티브 ECS JSON | `dev` | 끔 |
| `prod` | Spring Boot 네이티브 ECS JSON | `prod` | 끔 |

여기서 ECS는 Elastic Common Schema이며, AWS ECS 배포를 뜻하지 않는다.
dev/prod에서는 콘솔 배너도 꺼서 일반 시작 출력에 텍스트 배너가 섞이지 않게 한다.
별도 JSON encoder 의존성 없이 `logging.structured.format.console=ecs`를 사용한다.
`service.name`은 `spring.application.name`(`jarihana`), `service.version`은
`APP_VERSION`이다. 직접 실행에서 버전을 주입하지 않으면 `unknown`을 기록한다.
배포 Compose는 이미지 태그 `BACKEND_TAG`를 `APP_VERSION`으로 전달하며, 기존
개발·운영 workflow가 `BACKEND_TAG=${{ github.sha }}`를 설정한다.
`@timestamp`, `log.level`, `log.logger`, `process`, `ecs.version`은 Boot formatter가
생성한다. `ecs.version`을 애플리케이션 버전으로 덮어쓰거나 별도로 고정하지 않는다.
서비스 설정과 기본값은 [Spring Boot 4.1 로깅 문서](https://docs.spring.io/spring-boot/4.1/reference/features/logging.html#features.logging.structured.elastic-common-schema)를 따른다.

애플리케이션 이벤트 logger는 `com.project.jarihana.common.logging.Events`다.
HTTP 시작은 `event.action=http.request.started`, 완료는
`event.action=http.request.completed`로 구분한다. HTTP 이벤트의
`event.category`는 `["web"]`, `event.type`은 시작 `["start"]`·완료 `["end"]`인
JSON 배열이다. `http.response.status_code`와 `event.duration`은 JSON 숫자다. `event.duration` 단위는 나노초다. 업무 완료 이벤트는 별도의
`*.completed` action을 사용하므로 전체 요청 수에 합산하지 않는다. 업무 완료는 관측한
메서드 호출의 정상 완료를 뜻하며, 모든 내부 분기나 실제 변경 건수를 보장하지 않는다.

SLF4J key-value와 MDC의 점으로 구분된 필드는 네이티브 ECS formatter에서 중첩
JSON으로 출력된다. HTTP 시작 이벤트에는 요청 ID와 method가 있다. Security 처리
전부터 `KnownRequestRoutes`의 고정 허용 목록에 맞는 경로를 정규화해
`jarihana.route`에 남기고, 허용된 숫자 경로 ID를 `jarihana.path.*`에 기록한다.
따라서 알려진 경로의 인증·인가 거절도 경로별로 조사할 수 있다. 완료 시에는 실제
MVC 매핑을 우선하며 상태·소요 시간과 수집한 문맥을 추가한다. 허용 목록에도 MVC
매핑에도 없는 경로는 생략하고, 원시 URI는 기록하지 않는다.

| 필드 | 의미와 제한 |
| --- | --- |
| `http.request.id` | 서버 생성 요청 ID. 응답 `X-Request-Id`와 대응 |
| `user.id` | 확인된 내부 회원 ID. 이름·이메일·토큰에서 임의 추출하지 않음 |
| `jarihana.request.body.*` | 모집 생성·수정의 `joinMethod`·`capacity`, 신청 결정의 `status`, 모임장 위임의 `groupMemberId`만 기록 |
| `jarihana.request.query.*` | 그룹 목록의 `status`, `relation`, `role`, `type`, `recruiting`, `size`, `cursor_present`. null·원시 cursor·검색어 제외 |
| `jarihana.error_code` | 애플리케이션의 고정 오류 코드 |
| `jarihana.auth_failure` | 인증·인가 실패 완료 이벤트의 허용된 사유 코드 |
| `jarihana.invalid_fields` | 허용된 검증 실패 필드 이름. 입력값 제외 |
| `error.type`, `error.stack_trace` | 예외 타입과 정제한 스택. 스택은 아래 예외 소유 경계에서만 기록하며 예외 원문과 cause 메시지는 제외 |

`jarihana.*`는 서비스 확장이며 ECS 표준 필드가 아니다. 요청마다 모든 필드가
있는 것은 아니다. 허용 목록에 없는 DTO 필드를 자동으로 추가하지 않는다.
요청 요약은 바인딩·검증을 통과한 DTO의 값이므로 기본값도 포함할 수 있다.
검증을 통과하지 못한 요청은 입력값을 수집하지 않는다.

## 이벤트 목록과 해석

`BusinessOperationLoggingInterceptor`는 아래 공개 서비스 메서드를 명시적으로
관찰한다. 표의 action 뒤에 정상 완료는 `.completed`, 예외는 `.failed`가 붙는다.
`jarihana.event.category=business`, `event.type=["end"]`이며 결과는
`event.outcome=success|failure`다. 업무 이벤트에는 ECS `event.category`를 생략한다.
ECS의 `process`는 OS 프로세스 활동 분류이므로 업무 처리 분류로 사용하지 않는다.
분류의 의미는 [ECS 공식 분류 문서](https://www.elastic.co/docs/reference/ecs/ecs-allowed-values-event-category)를 따른다.

| 서비스 | 메서드 → action |
| --- | --- |
| `MemberCommandService` | `signup` → `member.signup` |
| `GithubOAuthCommandService` | `login` → `auth.github.login` |
| `AuthCommandService` | `logout` → `auth.logout` |
| `GroupCommandService` | `createGroup` → `group.create`, `modifyGroup` → `group.modify`, `deleteGroup` → `group.delete`, `terminateGroup` → `group.end` |
| `GroupCommandService` 일정 | `replaceRecurringSchedule` → `group.recurring.replace`, `removeRecurringSchedule` → `group.recurring.remove`, `replaceSessionSchedule` → `group.session.replace` |
| `RecruitmentCommandService` | `createRecruitment` → `recruitment.create`, `updateRecruitment` → `recruitment.update`, `closeRecruitment` → `recruitment.close` |
| `RegistrationCommandService` | `createRegistration` → `registration.create`, `decideRegistration` → `registration.decide`, `withdrawRegistration` → `registration.withdraw` |
| `GroupMemberCommandService` | `transferLeader` → `group.leader.transfer` |
| `ImageUploadCommandService` | `createImageUpload` → `image.upload_url.create` |

활성 외부 트랜잭션에 참여하면 성공 이벤트는 커밋 뒤에 기록한다. 이때 소요 시간은
관찰한 호출 구간이며, 이후 외부 트랜잭션의 커밋 대기 시간까지 의미하지 않는다.
트랜잭션이 없는 호출의 성공은 메서드 정상 반환을 뜻한다. private 메서드와
self invocation, 모든 내부 분기를 별도 이벤트로 관찰하지 않는다.

로그인은 `GithubLoginResult`에서 `jarihana.signup_required`를 기록한다. 이 결과에는
내부 회원 ID가 없으므로 토큰을 해석해 `user.id`를 추출하지 않는다. 가입 결과나
인증 문맥 등 확인 가능한 경계에서만 내부 회원 ID를 기록한다.

외부 어댑터와 HTTP 교환은 다음과 같이 구분한다. 어댑터의 category/type은
`["network"]`/`["end"]`다.

| 관찰 경계 | action | 의미 |
| --- | --- | --- |
| `ExternalAdapterLoggingInterceptor`: `S3ImageStorage.exists` | `s3.object.exists.completed` / `.failed` | 존재 여부 조회의 완료·실패. 존재하지 않아도 정상 조회이면 `jarihana.object_exists=false`와 성공 |
| 같은 interceptor: `S3ImageStorage.issueUploadUrl` | `s3.presign.completed` / `.failed` | 업로드 URL 발급. 실제 파일 업로드 완료를 뜻하지 않음 |
| 같은 interceptor: `GithubOAuthHttpClient.getGithubId` | `github.identity.completed` / `.failed` | 응답 본문 해석·필수 값 검증까지 포함한 GitHub 식별자 조회 |
| `GithubHttpLoggingInterceptor` | 항상 `github.http.completed` | 개별 HTTP 교환의 상태·소요 시간과 `event.outcome`. 전송 예외로 응답이 없으면 상태 코드 생략 |

`image.upload_url.create.completed`도 업로드 준비 완료이며 파일 전송 완료가 아니다.
GitHub HTTP 이벤트는 `jarihana.duration_scope=response_headers`로 측정 범위를 표시한다.
본문 읽기·JSON 변환·의미 검증은 포함하지 않으므로 HTTP 200/성공만으로 로그인 성공을
판정하지 않는다. 전체 `github.identity`와 `auth.github.login` 결과를 함께 확인한다.
이 HTTP logger는 `com.project.jarihana.auth.client.GithubHttpLoggingInterceptor`다.

AOP의 업무·어댑터 실패에는 타입과 해당하는 고정 오류 코드만 남기며 스택을 반복하지
않는다. 애플리케이션 오류 스택의 소유자는 `GlobalExceptionHandler`이고,
`application.error` 중 예상하지 못한 `INTERNAL_ERROR`에만 정제한 스택을 남긴다.
예상한 업무·검증 실패는 타입과 코드만 기록한다. 해당 logger는
`com.project.jarihana.common.exception.GlobalExceptionHandler`이며 category/type은
`["web"]`/`["error"]`다.
정제한 스택은 예외별 앞 24개 프레임과 원인 예외의 타입·프레임을 기록하고,
전체 8,192자로 제한한다. 매우 깊은 원인 연결은 제한 안에서만 남는다.

## 로컬 확인

명령은 `backend/`에서 실행한다. DB와 OAuth 환경 변수 준비는
[README의 로컬 실행](../../README.md#로컬-postgresql-실행)을 따른다.

```bash
docker compose -f docker-compose-local.yaml up -d
cp -n .env.example .env
# .env를 채운 후 현재 셸로 읽는다.
set -a
source .env
set +a
./gradlew bootRun --args='--spring.profiles.active=local'
```

서버가 시작되면 별도 터미널에서 공개 API를 호출한다.

```bash
curl -i http://localhost:8080/api/groups
```

응답의 `X-Request-Id`와 HTTP 시작·완료 이벤트를 대조한다. 요청 ID는 분산 추적
시스템의 `trace.id`와 다르며, 같은 요청 안의 로그 연결에 사용한다.
로컬 DB를 그대로 사용하며 JSON만 확인하려면 서버를 종료한 뒤 다음과 같이
포맷과 서비스 환경을 명시적으로 덮어써 실행한다.

```bash
APP_VERSION=local-check ./gradlew bootRun \
  --args='--spring.profiles.active=local --spring.jpa.show-sql=false --logging.structured.format.console=ecs --logging.structured.ecs.service.environment=local'
```

일반 로그가 한 줄 JSON인지, `service.version=local-check`인지 확인한다.
이 실행은 dev/prod 프로필의 DB schema validation이나 AWS 전송 검증을 대신하지 않는다.

## CloudWatch 배포 전 준비

배포용 `infra/docker-compose.dev.yml`과 `infra/docker-compose.yml`의 backend만
Docker `awslogs` driver를 사용한다. PostgreSQL과 로컬 Compose는 대상이 아니다.

| 설정 | 개발 기본값 | 운영 기본값 |
| --- | --- | --- |
| `CLOUDWATCH_LOG_GROUP` | `/jarihana/dev/application` | `/jarihana/prod/application` |
| `CLOUDWATCH_LOG_REGION` | `ap-northeast-2` | `ap-northeast-2` |
| 로그 스트림 | `<BACKEND_TAG>/<container ID>` | `<BACKEND_TAG>/<container ID>` |
| 그룹 자동 생성 | `false` | `false` |
| 전송 모드 / 버퍼 | `non-blocking` / `4m` | `non-blocking` / `4m` |

지역과 그룹을 바꾸려면 **Compose 실행 환경**에 해당 변수를 주입한다. 현재 workflow는
이 두 GitHub Variables를 자동 매핑하지 않으므로, GitHub UI에 값을 등록하는 것만으로
override가 적용되지는 않는다. 기본값을 쓸 때는 추가 workflow 변수가 필요 없다.
환경별 그룹 이름은 반드시 구분한다.

배포 전 `CloudWatch Manage`의 `cloudwatch-prepare`를 실행해 선택한 환경의 로그 그룹을
만든다. `cloudwatch-install`도 같은 prepare를 먼저 실행한다. 수동 SSH에서는 저장소 루트에서
다음처럼 실행한다.

```bash
TARGET_ENVIRONMENT=dev EXPECTED_INSTANCE_ID=<확인한-EC2-ID> APPLICATION_LOG_RETENTION_DAYS=14 bash infra/cloudwatch/prepare-aws.sh
```

`TARGET_ENVIRONMENT`는 `dev` 또는 `prod`이고, 기본 로그 그룹은 각각
`/jarihana/dev/application`, `/jarihana/prod/application`이다. 보존 기간 기본값은
14일이며 CloudWatch Manage 선택지는 7, 14, 30, 60, 90일이다. 기본 그룹을 override하는
수동 실행에서는 `CLOUDWATCH_LOG_GROUP`이 Compose 실행 환경의 `CLOUDWATCH_LOG_GROUP`과
같아야 한다. `prepare-aws.sh`는 확인한 EC2 리전에 로그 그룹을 만들기 때문에 Compose의
`CLOUDWATCH_LOG_REGION`도 같은 리전을 사용해야 한다. 현재 배포 workflow는 그룹·지역
override용 GitHub Variables를 자동 매핑하지 않는다.

배포 담당자는 새 컨테이너를 띄우기 전에 다음 조건을 확인한다.

1. 선택 환경의 로그 그룹이 해당 지역에 있고 보존 기간이 설정되어 있다.
2. Docker daemon이 사용하는 EC2 instance profile에 해당 그룹의 스트림 생성·기록
   권한이 있다. 애플리케이션 컨테이너에 AWS access key를 추가하지 않는다.
3. 호스트에서 instance profile 자격 증명과 해당 지역 CloudWatch Logs endpoint에
   접근할 수 있다. 외부 통신 경로나 VPC endpoint, DNS, HTTPS 통신을 확인한다.
4. 그룹 이름·지역·IAM·통신이 Compose 실행 환경과 일치한다. 그룹이 없거나 권한·통신이
   불충분하면 `awslogs` 초기화로 컨테이너 시작이 실패할 수 있다.

AWS 관리형 [`CloudWatchAgentServerPolicy`](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/CloudWatchAgentServerPolicy.html)
v3에는 로그 그룹 생성, 스트림 생성, 이벤트 기록, 로그 그룹 조회, 보존 기간 설정 권한이
`Resource: "*"`로 포함되어 있다. 이 정책이 Docker
호스트의 EC2 역할에 이미 연결되어 있으면 새 애플리케이션 로그 그룹 준비와 Docker 로그 전송에
같은 역할을 재사용할 수 있다. 실제 역할 연결 여부는 이 저장소에서 검증하지 않는다.

아래는 이미 준비된 로그 그룹에 Docker 런타임 쓰기 권한만 따로 줄 때의 최소 예시다.
`ACCOUNT_ID`와 지역·그룹 이름을 실제 준비한 값으로 교체한다. 개발과 운영이 다른 호스트라면
각 호스트가 기록할 그룹만 허용한다. 조회 담당자의 `FilterLogEvents`, `StartQuery`,
`GetQueryResults` 등 조회 권한은 이 쓰기 정책과 별도로 관리한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": [
        "arn:aws:logs:ap-northeast-2:ACCOUNT_ID:log-group:/jarihana/dev/application:log-stream:*",
        "arn:aws:logs:ap-northeast-2:ACCOUNT_ID:log-group:/jarihana/prod/application:log-stream:*"
      ]
    }
  ]
}
```

이 최소 예시는 `prepare-aws.sh` 실행 권한이 아니다. 그룹 생성과 보존 기간 변경까지
같은 역할에서 수행하려면 `logs:CreateLogGroup`, `logs:DescribeLogGroups`,
`logs:PutRetentionPolicy`가 추가로 필요하다. Docker 자격 증명·쓰기 권한은
[awslogs 문서](https://docs.docker.com/engine/logging/drivers/awslogs/)를,
리소스 ARN은 [CloudWatch IAM 문서](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/iam-access-control-overview-cwl.html)를 따른다.

`non-blocking`은 전송 정체가 요청 처리를 막지 않게 하는 선택이다. 컨테이너별
중간 버퍼 `4m`가 가득 차면 새 로그가 버려진다. 전송 장애·급격한 트래픽·프로세스
종료 시 로그 완전성을 보장하지 않으므로 이 스트림을 감사 원장으로 사용하지 않는다.
버퍼 크기는 [Docker 전송 모드](https://docs.docker.com/engine/logging/configure/#configure-the-delivery-mode-of-log-messages-from-container-to-log-driver)의
상한이며 전체 Docker 메모리 사용량의 상한을 뜻하지 않는다.

## 배포 후 확인과 장애 조사

기존 배포 절차로 컨테이너를 재생성해야 logging 설정이 적용된다. 단순 restart로
기존 컨테이너의 driver 설정이 바뀌지는 않는다. 배포용 환경 변수를 준비한
`backend/` 셸에서 개발 컨테이너의 실제 설정을 확인한다.

```bash
docker compose -f ../infra/docker-compose.dev.yml config --quiet
container_id=$(docker compose -f ../infra/docker-compose.dev.yml ps -q backend)
docker inspect --format '{{json .HostConfig.LogConfig}}' "$container_id"
curl -i http://localhost:80/api/groups
aws logs tail /jarihana/dev/application --region ap-northeast-2 --since 5m --format short
```

운영 확인은 Compose 파일을 `../infra/docker-compose.yml`, 포트를 `8080`, 그룹을
`/jarihana/prod/application`으로 바꾼다. 그룹과 지역을 override했다면 명령에도 같은
값을 사용한다. 응답 `X-Request-Id`로 같은 요청을 찾고 다음을 확인한다.

- 로그 그룹이 환경별로 분리되어 있고 `service.environment`와 일치한다.
- `service.version`이 배포한 이미지의 커밋 SHA와 같다.
- 시작·완료 이벤트가 연결되고 완료의 상태 코드와 소요 시간이 JSON 숫자다.
- 토큰·쿠키·OAuth code/state·개인정보·자유 입력 본문이 로그에 없다.

이 확인은 실제 AWS 수집 검증 절차이며, 로컬 설정 검증 성공만으로 통과했다고
판정하지 않는다. 수집이 없으면 그룹/지역 오타, EC2 role, endpoint 통신, Docker
호스트 로그의 driver 오류, 새 컨테이너 반영 여부 순으로 확인한다. `docker logs`
출력은 로컬 캐시일 수 있으므로 CloudWatch 수신 증거로 취급하지 않는다.

## Logs Insights 예시

대상 환경의 그룹과 좁은 시간 범위를 선택한다. JSON 필드 검색은
[CloudWatch Logs Insights 문법](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-operations-functions.html)을 사용한다.
아래 쿼리는 배포 후 실제 수집 데이터로 확인한다.

요청 ID로 시간순 조사:

```text
fields @timestamp, event.action, log.level, jarihana.route, http.response.status_code, event.duration, error.type
| filter http.request.id = "응답의-X-Request-Id"
| sort @timestamp asc
| limit 200
```

5분 단위 API별 요청 수:

```text
filter log.logger = "com.project.jarihana.common.logging.Events"
| filter event.action = "http.request.completed"
| stats count(*) as requests by bin(5m), jarihana.route
```

상태 코드별 오류 수:

```text
filter log.logger = "com.project.jarihana.common.logging.Events"
| filter event.action = "http.request.completed" and http.response.status_code >= 400
| stats count(*) as errors by bin(5m), http.response.status_code, jarihana.route
```

API별 지연 시간(ms):

```text
filter log.logger = "com.project.jarihana.common.logging.Events"
| filter event.action = "http.request.completed"
| fields event.duration / 1000000 as duration_ms
| stats count(*) as requests, avg(duration_ms) as avg_ms, pct(duration_ms, 95) as p95_ms, max(duration_ms) as max_ms by jarihana.route
```

요청 수·오류 수·지연 시간은 모두 HTTP **완료 이벤트만** 집계한다. 시작 이벤트와
업무 완료 이벤트를 합치면 중복 집계된다. 종료 전에 프로세스가 죽거나 로그가 유실되면
완료 이벤트가 없을 수 있으므로 이 수치는 관측된 완료 요청에 한정된다.

## 개인정보와 변경 규칙

새 필드는 API별로 허용 목록을 검토한 뒤 추가한다. 비밀번호, 인증 토큰, 쿠키,
OAuth code/state, 이메일·이름, 원시 query string, 검색어, 제목·설명·피드백 내용,
전체 요청·응답 본문과 presigned URL은 기록하지 않는다. 숫자·enum·boolean 등의
허용된 요약도 업무상 필요 범위로 제한한다. DTO 전체의 `toString()`이나 예외 원문을
메시지에 붙이지 않는다. SQL·바인딩 DEBUG/TRACE를 배포 환경에서 무심코 켜지 않는다.

ECS 포맷 자체는 민감정보를 제거하지 않는다. 애플리케이션의 명시적 필드 선택과
예외 정제가 보호 경계이며, 프레임워크·외부 라이브러리 로그까지 자동으로 정제한다고
가정하지 않는다. 로그 접근 권한과 보존 기간을 제한하고 신규 이벤트 변경 때 민감값
부재 및 요청 간 MDC 잔존 여부를 테스트한다.
