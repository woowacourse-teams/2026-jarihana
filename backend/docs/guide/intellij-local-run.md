# IntelliJ 로컬 실행 가이드

IntelliJ에서 `local` 프로파일로 백엔드를 실행하는 방법입니다.

IntelliJ의 Spring Boot 실행 구성은 `backend/.env`를 자동으로 읽지 않습니다. 터미널에서
`.env`를 export 하고 `./gradlew bootRun`으로 실행하면 되지만, 실행 버튼을 누르는 경우에는
실행 구성에 직접 연결해 주어야 합니다. 아래 2단계가 그 설정입니다.

## 사전 준비: 로컬 PostgreSQL

DB 접속 정보는 `application.yaml`에서 환경 변수로 주입됩니다. 프로파일과 무관하게 공통으로
적용됩니다.

```yaml
spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
```

기본값이 없으므로 세 값은 로컬 실행에서도 반드시 채워야 합니다. 즉 **어떤 DB에 붙을지는
`.env`가 결정합니다.** 아래에서 DB를 준비한 뒤, 그 접속 정보를 1단계에서 `.env`에 적습니다.

`local` 프로파일은 datasource가 아니라 `ddl-auto: update`, `show-sql`, 쿠키의
`secure: false` 같은 개발 편의 설정을 담당합니다. 그래서 프로파일과 `.env` 둘 다 필요합니다.

DB는 컨테이너와 로컬 설치본 중 하나로 준비하면 되고, 앱 입장에서는 구분되지 않습니다.
다만 **둘 중 하나만 5432를 점유할 수 있으므로 한 방식을 골라야 합니다.**

### 방식 A: 로컬에 설치된 PostgreSQL 사용

Docker를 실행할 필요가 없습니다. 최초 1회만 DB를 만들어 두면 됩니다.

**1) 서버가 실행 중인지 확인합니다**

| OS | 확인 명령 | 시작 명령 |
| --- | --- | --- |
| Windows | `powershell -Command "Get-Service *postgresql*"` | 서비스로 자동 실행됩니다 |
| macOS (Homebrew) | `brew services list \| grep postgresql` | `brew services start postgresql@17` |
| Linux (패키지) | `systemctl status postgresql` | `sudo systemctl start postgresql` |

**2) 슈퍼유저로 접속합니다**

접속 계정은 설치 방식마다 다릅니다.

| 환경 | 접속 명령 | 비고 |
| --- | --- | --- |
| Windows 설치 프로그램 | `psql -U postgres` | 설치할 때 정한 비밀번호를 사용합니다 |
| macOS Homebrew | `psql -d postgres` | OS 사용자 이름으로 슈퍼유저가 만들어지며, `postgres` 롤은 없을 수 있습니다 |
| Linux 패키지 | `sudo -u postgres psql` | peer 인증이라 비밀번호가 필요 없습니다 |

**3) DB를 만듭니다**

접속 방식과 무관하게 SQL은 동일합니다.

```sql
CREATE DATABASE jarihana;
```

이 경우 `.env`의 `DB_USERNAME`과 `DB_PASSWORD`에는 방금 접속한 슈퍼유저 계정을 적습니다.

**4) 확인합니다**

`.env`에 적을 계정으로 실제 접속되는지 봅니다.

```bash
psql -h 127.0.0.1 -U <DB_USERNAME> -d jarihana -c "\conninfo"
```

### 방식 B: Docker Compose 사용

로컬에 PostgreSQL을 설치하지 않았다면 컨테이너로 띄웁니다.

```bash
docker compose -f compose-local.yaml up -d
```

`compose-local.yaml`이 DB, 계정, 비밀번호를 모두 `jarihana`로 만들어 주므로 `.env`도 여기에
맞춰야 합니다.

```bash
DB_URL=jdbc:postgresql://localhost:5432/jarihana
DB_USERNAME=jarihana
DB_PASSWORD=jarihana
```

설치본 서비스가 실행 중이면 5432 충돌로 컨테이너가 뜨지 않습니다. 이때는 서비스를 먼저
중지하거나 방식 A를 씁니다.

두 방식 모두 `local` 프로파일의 `ddl-auto`가 `update`이므로 테이블은 첫 실행 때 자동
생성됩니다. DB만 만들어 두면 됩니다.

## 1. `.env` 정보 입력

`backend/.env.example`을 복사해 `backend/.env`를 만듭니다.

```bash
cp backend/.env.example backend/.env
```

`.env`는 `.gitignore` 대상이라 커밋되지 않습니다. 로컬 실행에 맞게 값을 채웁니다.

| 키 | 로컬 실행 시 값 | 필수 여부 |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | `local` | 필수. `.env.example`에는 `prod`로 되어 있으니 반드시 바꿉니다 |
| `DB_URL` | `jdbc:postgresql://localhost:5432/jarihana` | 필수. 기본값이 없습니다 |
| `DB_USERNAME` | 사전 준비에서 정한 계정 | 필수 |
| `DB_PASSWORD` | 해당 계정의 비밀번호 | 필수 |
| `ACCESS_TOKEN_SECRET` | 32자 이상 문자열 | 필수 |
| `REFRESH_TOKEN_SECRET` | 그대로 두어도 됩니다 | 현재 설정에서 참조하지 않습니다 |

`ACCESS_TOKEN_SECRET`은 HMAC-SHA256 서명 키로 쓰이며 32자(256비트) 이상이어야 합니다.
`JwtProperties`에 `@NotBlank`, `@Size(min = 32)`가 걸려 있어 조건을 어기면 어떤 값이
문제인지 알려주며 기동이 중단됩니다.

```text
Binding to target com.project.jarihana.common.auth.JwtProperties failed:
    Property: jarihana.auth.jwt.secret
    Value: "tooshort1234"
    Reason: 크기가 32에서 2147483647 사이여야 합니다
```

아래처럼 임의 값을 만들어 쓰면 됩니다.

```bash
openssl rand -hex 32
```

이 밖에 `FRONTEND_ORIGIN`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`,
`GITHUB_OAUTH_REDIRECT_URI`도 설정에서 참조하지만 모두 기본값이 있어 로컬 기동에는
필수가 아닙니다. GitHub 로그인을 실제로 테스트할 때만 채웁니다.

## 2. IntelliJ 환경 변수, 프로필 설정

`Run > Edit Configurations`에서 `JarihanaApplication` 구성을 선택하고 두 가지를 지정합니다.

1. **Active profiles**에 `local` 입력
2. **Modify options > Environment variables**를 켜고, 값 입력란 오른쪽의 파일 아이콘에서
   `backend/.env`를 선택

`.env` 파일을 실행 구성에 연결하는 기능은 IntelliJ IDEA Ultimate의 Spring Boot 실행 구성에
기본 내장되어 있습니다. 별도 플러그인은 필요 없습니다. (확인 환경: IU-253.32098.37)

설정이 끝나면 `.idea/workspace.xml`의 해당 구성이 아래 형태가 됩니다.

```xml
<configuration name="JarihanaApplication" type="SpringBootApplicationConfigurationType" factoryName="Spring Boot">
  <option name="ACTIVE_PROFILES" value="local" />
  <option name="envFilePaths">
    <option value="$PROJECT_DIR$/.env" />
  </option>
  <module name="jarihana.main" />
  <option name="SPRING_BOOT_MAIN_CLASS" value="com.project.jarihana.JarihanaApplication" />
</configuration>
```

시크릿을 실행 구성에 직접 붙여넣지 않고 `.env` 한 곳에서만 관리하는 방식입니다.

`.idea/workspace.xml`은 `.gitignore` 대상이라 이 실행 구성은 팀원에게 공유되지 않습니다.
각자 한 번씩 설정해야 합니다.

## 실행 확인

실행 후 로그에서 두 줄을 확인합니다.

```text
Database JDBC URL [jdbc:postgresql://localhost:5432/jarihana]
Started JarihanaApplication in 7.492 seconds
```

JDBC URL이 `.env`의 `DB_URL`과 같은지 봅니다.

## 문제 해결

### `Binding to target ... JwtProperties failed`

`ACCESS_TOKEN_SECRET`이 전달되지 않았거나 32자 미만입니다. 실행 구성에 `.env`가 연결되었는지,
값이 32자 이상인지 확인합니다. 메시지에 위반한 프로퍼티와 실제 값이 함께 표시됩니다.

### `'url' must start with "jdbc"`

`DB_URL`이 전달되지 않았습니다. `${DB_URL}`에는 기본값이 없어서 빈 문자열로 바인딩된
결과입니다. 실행 구성에 `.env`가 연결되었는지 확인합니다.

### `Port 8080 was already in use`

이전 실행이 남아 있거나 다른 프로세스가 8080을 쓰고 있습니다. 해당 프로세스를 종료하거나
다른 포트로 실행합니다.

```bash
./gradlew bootRun --args='--server.port=8081'
```

### `password 인증을 실패했습니다`

`.env`의 `DB_USERNAME`, `DB_PASSWORD`가 준비한 DB의 계정과 다릅니다.

이때 5432에 실제로 어떤 PostgreSQL이 응답하고 있는지부터 확인하는 것이 빠릅니다. 설치본
서비스와 컨테이너 중 어느 쪽에 DB를 만들었는지 착각하기 쉽습니다.

Windows에서는 다음과 같이 확인합니다.

```bash
netstat -ano | findstr ":5432"
docker ps --filter "name=jarihana"
```

macOS와 Linux에서는 다음과 같이 확인합니다.

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
docker ps --filter "name=jarihana"
```

컨테이너 목록이 비어 있는데 5432가 열려 있다면 로컬 설치본이 응답하고 있는 것이므로,
DB도 그쪽에 만들어야 합니다.

### 테이블이 생성되지 않는다

Active profiles에 `local`이 지정되지 않은 경우입니다. `ddl-auto: update`는 `local`
프로파일에만 있어서, 프로파일 없이 실행하면 스키마가 자동 생성되지 않습니다.
