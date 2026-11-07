# 크루 명단 적재

우테코 크루 명단을 `crew_roster`에 넣는 운영 절차다. 규칙은 [회원 모델의 크루 명단](../context/domain/model/member.md#크루-명단)을 따른다.

## 배포와 적재 순서

1. `crew_roster` 테이블(V25)이 들어간 버전을 배포한다. 이 버전의 애플리케이션은 명단을 읽지 않는다.
2. 아래 적재 절차로 dev와 prod에 명단을 넣는다.
3. 가입과 GitHub 로그인 때 명단으로 크루를 인증하는 버전을 배포한다. 명단이 미리 들어 있으므로 배포 직후부터 인증된다.

명단은 이후에도 언제든 다시 넣을 수 있다. 새 기수가 들어오면 같은 절차로 추가한다.

## 명단 파일

- 저장소가 공개이므로 명단 파일은 저장소에 두지 않는다. 커밋, PR, 이슈, 채팅방에도 올리지 않는다.
- CSV 열 순서는 `github_id,crew_name,generation,course,github_login`이고 첫 줄은 헤더다.
  - `github_id`: GitHub 숫자 id. `member.github_id`와 같은 값이다. 로그인 이름이 아니다.
  - `generation`: 양수 기수
  - `course`: `BACKEND`, `FRONTEND`, `ANDROID`
  - `crew_name`, `github_login`: 사람이 확인하는 용도로만 읽고 DB에는 저장하지 않는다.
- UTF-8(BOM 있어도 됨)과 CRLF 줄바꿈을 그대로 받는다.
- GitHub 로그인 이름만 있는 원본 명단은 GitHub API(`GET /users/{login}`의 `id`)로 숫자 id를 채운 뒤 넣는다. 로그인 이름이 없는 크루는 넣을 수 없으므로 따로 확인한다.

## 적재

[`crew-roster-import.sql`](../../db/operations/crew-roster-import.sql)을 CSV를 표준 입력으로 넘겨 실행한다.
dev와 prod는 DB 계정이 다르므로 각각 실행한다.

```bash
psql "$DATABASE_URL" -f backend/db/operations/crew-roster-import.sql < crew_whitelist.csv
```

스크립트는 하나의 트랜잭션에서 다음을 한다.

1. CSV를 임시 테이블로 읽고, 빈 명단, 숫자가 아닌 `github_id`, 중복 `github_id`를 거절한다.
2. `crew_roster`에 넣는다. 같은 `github_id`가 이미 있으면 기수와 과정을 새 값으로 바꾼다. 명단에서 빠진 사람은 지우지 않는다.
3. 이미 가입한 기본 멤버, 부트캠프 회원, 현직자 중 명단에 있는 회원을 크루로 바꾼다. 같은 기수에 같은 닉네임의 크루가 있으면 건너뛴다. 이미 크루나 코치인 회원은 바꾸지 않는다.

한 줄이라도 잘못되면 아무것도 바뀌지 않는다. `psql`이 출력하는 `INSERT 0 N`과 `UPDATE N`으로 넣은 명단 수와 크루로 바뀐 회원 수를 확인한다.

## 확인

```sql
SELECT count(*) FROM crew_roster;
SELECT member_type, count(*) FROM member GROUP BY member_type;
```

3단계에서 건너뛴 회원(같은 기수 닉네임 중복)은 크루로 바뀌지 않는다. 필요하면 해당 회원과 닉네임 변경을 따로 조율한다.

## 검증

`CrewRosterImportScriptTest`가 PostgreSQL 17 컨테이너에서 이 스크립트를 실제 `psql`로 실행해 적재, 재적재, 기존 회원 인증, 닉네임 중복 건너뛰기, 잘못된 줄의 전체 롤백을 확인한다. 테스트 CSV는 가짜 값이다.
