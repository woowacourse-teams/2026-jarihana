# 회원 아바타

본인 계정의 입체 캐릭터 파츠 설정이다. 기존 GitHub 프로필 사진 `avatarUrl`과 별도다.
토론 작성자 응답, 다른 회원 아바타 조회와 토론 연결은 이 API에 포함하지 않는다.

## GET `/api/members/me/avatar`

가입 완료 회원의 Access Token이 필요하다. 가입 세션만으로는 사용할 수 없다.
`200` 공통 성공 봉투의 `data`:

```json
{
  "customized": false,
  "appearance": {
    "version": 1, "hair": "bald", "skin": "warm", "hairColor": "ink",
    "face": "round", "eyes": "dot", "eyebrows": "straight", "nose": "small",
    "mouth": "flat", "glasses": "none", "outfit": "cream"
  }
}
```

저장 전과 삭제 후에는 위 기본형을 반환하며 조회로 행을 생성하지 않는다.
저장 후에는 `customized: true`와 저장한 파츠를 반환한다.

## PUT `/api/members/me/avatar`

인증 및 CSRF 검증 후 생성·전체 교체한다. 요청은 `{ "appearance": { ... } }`이고
위 예시의 11개 필드를 모두 보낸다. 성공은 본문 없는 `204`이며 재조회로 저장값을 확인한다.
동일한 요청을 반복해도 회원당 한 행만 유지한다. 일부만 보내는 PATCH는 제공하지 않는다.

| 필드 | 허용 값 |
| --- | --- |
| version | 숫자 1 |
| hair | curly, parted, bob, long, flowing, bald |
| skin | pearl, warm, tan, deep |
| hairColor | ink, chestnut, copper, silver |
| face | round, oval, wide |
| eyes | round, slim, dot |
| eyebrows | arched, straight, bold |
| nose | round, small, wide |
| mouth | smile, flat, open |
| glasses | none, round, square |
| outfit | mint, coral, cream, navy, lilac, ochre |

필드 누락·null·허용하지 않은 값·버전은 `400 INVALID_PARAMETER`로 거부한다.
임의 자산 URL, 위치·크기·자세, 회원 ID는 외형 계약에 없다. 대상 회원은 인증 정보로만 정한다.

## DELETE `/api/members/me/avatar`

인증 및 CSRF 검증 후 저장한 조합을 물리적으로 삭제한다. 성공은 본문 없는 `204`다.
미생성·이미 삭제된 경우도 같은 응답이다. 이후 GET은 기본형을 반환한다.
저장·삭제는 같은 회원 행의 잠금으로 직렬화하며 마지막 완료된 명령이 최종 모습이다.

미인증·존재하지 않는 회원은 `401 UNAUTHENTICATED`, CSRF 실패는 기존 공통 `403` 계약을 따른다.

## 저장과 배포

`V20__member_avatar.sql`은 회원당 하나의 선택 설정 테이블만 추가한다. 기존 `member` 컬럼과
프로필 응답은 유지한다. 구버전 앱은 새 테이블을 사용하지 않고 회원을 생성할 수 있으며 신규 회원도 기본형으로 읽는다.
앱 롤백 후 테이블과 조합은 남고 이전 앱은 사용하지 않는다. 기존 앱 이미지의 공존 실행 검증은 별도다.
현재는 파츠 조합 이력을 보관하지 않는다. Flyway 이력은 적용 후 수정·삭제하지 않는다.

검증: `MemberAvatarAcceptanceTest`가 실제 PostgreSQL에서 최초 조회, 생성, 교체, 재조회,
회원별 분리, 잘못된 요청 후 보존, 반복 삭제, 미인증 및 CSRF 차단을 확인한다.

`FlywayBaselineTest.addAvatarAfterV19PreservesOldMemberOperations`는 V19 DB에서 V20으로
올린 뒤 기존 회원·컬럼·이력 보존, 구버전 형태의 회원 INSERT/SELECT/UPDATE/DELETE,
새 아바타 행의 회원 삭제 연쇄 정리를 확인한다. 실제 구버전 앱 이미지 동시 실행은 포함하지 않는다.
