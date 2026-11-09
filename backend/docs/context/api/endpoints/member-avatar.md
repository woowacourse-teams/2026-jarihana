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
    "mouth": "flat", "glasses": "none", "outfit": "cream",
    "shoes": "sneakers", "shoeColor": "white", "hat": "none", "hatColor": "ink",
    "bag": "none", "bagColor": "ink", "handheld": "none"
  }
}
```

저장 전과 삭제 후에는 위 기본형을 반환하며 조회로 행을 생성하지 않는다.
저장 후에는 `customized: true`와 저장한 파츠를 반환한다.

## PUT `/api/members/me/avatar`

인증 및 CSRF 검증 후 생성·전체 교체한다. 요청은 `{ "appearance": { ... } }`이고
위 예시의 18개 필드를 보낸다. 성공은 본문 없는 `204`이며 재조회로 저장값을 확인한다.
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
| glasses | none, round, square, sunglasses |
| outfit | mint, coral, cream, navy, lilac, ochre |
| shoes | sneakers, slipOn, highTop |
| shoeColor | white, ink, mint, coral |
| hat | none, cap, bucket, beanie, beret |
| hatColor | ink, cream, mint, coral, navy |
| bag | none, backpack, crossbody, shoulder |
| bagColor | ink, cream, mint, coral, navy |
| handheld | none, hotCoffee, icedCoffee, book, laptop, phone |

신발 필드가 없던 버전 1 요청과의 호환성을 위해 `shoes` 생략·null은 `sneakers`,
`shoeColor` 생략·null은 `white`로 저장한다.
`hat` 생략·null은 `none`, `hatColor` 생략·null은 `ink`로 저장한다. 모자와 안경은 독립적으로 선택한다.
`bag` 생략·null은 `none`, `bagColor` 생략·null은 `ink`, `handheld` 생략·null은 `none`으로 저장한다.
확장 필드의 허용하지 않은 값과 기존 필드의 누락·null·허용하지 않은 값·버전은 `400 INVALID_PARAMETER`로 거부한다.
임의 자산 URL, 위치·크기·자세, 회원 ID는 외형 계약에 없다. 대상 회원은 인증 정보로만 정한다.

## DELETE `/api/members/me/avatar`

인증 및 CSRF 검증 후 저장한 조합을 물리적으로 삭제한다. 성공은 본문 없는 `204`다.
미생성·이미 삭제된 경우도 같은 응답이다. 이후 GET은 기본형을 반환한다.
저장·삭제는 같은 회원 행의 잠금으로 직렬화하며 마지막 완료된 명령이 최종 모습이다.

미인증·존재하지 않는 회원은 `401 UNAUTHENTICATED`, CSRF 실패는 기존 공통 `403` 계약을 따른다.

## 저장과 배포

`V33__member_avatar.sql` 한 파일의 `CREATE TABLE`로 모든 최종 파츠 컬럼을 만든다.
기존 `member` 컬럼과 프로필 응답은 유지하고 회원당 하나의 PK/FK·삭제 연쇄 정리를 둔다.
파츠 컬럼에는 NOT NULL·VARCHAR(16)만 두고 허용 값과 누락 확장 파츠의 기본값은 `AvatarCatalog`에서 관리한다.
향후 파츠 값이 늘어날 때 DB CHECK를 변경하거나 기존 행을 전수 검사하지 않기 위한 선택이다.
생성 입력은 `Map<AvatarCatalog, String>`으로 파츠 종류를 명시한다. 모자 색과 가방 색을 같은 위치 기반 인자로 넘기지 않는다.
`AvatarAppearance`는 검증된 선택값과 기존 JPA 컬럼 매핑을 유지한다. 기존 종류의 값 추가는 카탈로그만 수정하고, 새 저장 종류를 추가할 때는 컬럼·DTO 매핑도 함께 추가한다. JSONB 전환은 이번 변경에 포함하지 않는다. 도메인 검증을 우회한 직접 SQL은 허용 값 검증을 받지 않는다.

이 PR의 이전 V20~V23 아바타 파일은 공유 환경 미배포 상태에서 통합했다.
포인트 [#589](https://github.com/woowacourse-teams/2026-jarihana/pull/589)의 V30과 공지 재전송 [#602](https://github.com/woowacourse-teams/2026-jarihana/pull/602)의 V31이 먼저 적용되는 순서에 맞춰 아바타는 V33을 사용한다.
실제 적용된 공유 환경의 Flyway 파일을 바꾸는 절차가 아니다.
예전 PR 스키마를 적용했던 개인 로컬 DB에는 checksum repair·이력 삭제를 하지 말고 새 별도 DB를 사용한다.
기존 개인 DB와 저장 조합은 보존한다. 공유 환경에 적용된 후에는 후속 마이그레이션으로만 변경한다.

아바타 도입 전 앱은 새 테이블을 사용하지 않고 회원을 조회·생성·수정·삭제할 수 있다.
앱만 롤백하면 새 테이블과 조합은 남는다. 이미 배포된 이전 번들의 처리까지 소급 변경할 수는 없다.
이번 클라이언트부터 응답·렌더링의 모르는 파츠만 기본값으로 표시하며 다른 파츠는 보존하고,
추가 응답 필드는 버린다. 저장 요청의 지원 버전·파츠 허용 값 검증은 엄격하게 유지한다.
읽기 정규화 자체는 저장하지 않는다. 수정 후 전체 교체하면 표시된 조합으로 저장된다.
지원하지 않는 외형 버전은 오류로 처리한다.

검증: `MemberAvatarAcceptanceTest`는 최초 조회·생성·교체·재조회·회원 분리·잘못된 요청 보존·삭제·인증·CSRF를 확인한다.
`AvatarAppearanceTest.defaultsMissingExtensionPartsInDomain`은 누락 확장 파츠의 도메인 기본값을 검증한다.
`FlywayBaselineTest.addAvatarPreservesOldMemberOperations`는 V32 이하의 마이그레이션이 적용된 DB에서 V33으로 올린 뒤
회원·컬럼·이력 보존, 기존 회원 SQL, 최종 파츠 컬럼, NOT NULL, 회원 삭제 연쇄 정리를 확인한다.
실제 구버전 앱 이미지 동시 실행과 운영 규모의 FK 생성 잠금 시간은 미검증이다.
