# Member

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 회원 식별자 |
| `crewName` | String | NOT NULL, 한글 2–4자, 공백·특수문자 불가 | 우테코 크루 닉네임 |
| `memberType` | Enum | NOT NULL | `CREW`, `COACH`, `BOOTCAMP`(부트캠프 수강생, 수료생), `PROFESSIONAL`(IT 현직자), `MEMBER`(소속을 묻지 않고 가입한 기본 멤버) |
| `generation` | Integer | `CREW`는 NOT NULL, 그 외는 null. 사용자가 바꿀 수 없고 크루 명단 인증 때만 채워진다 | 기수 |
| `githubId` | String | NOT NULL, UNIQUE | 변경되지 않는 GitHub 사용자 숫자 ID |
| `course` | Enum | `CREW`는 NOT NULL, 그 외는 null | `BACKEND`, `FRONTEND`, `ANDROID` |
| `bootcamp` | Embedded `Bootcamp` | `BOOTCAMP`는 NOT NULL, 그 외는 null | 캠프 이름(30자 이하, 우아한테크코스 불가), 수강 상태(`IN_PROGRESS`, `COMPLETED`), 기수(선택, 20자 이하) |
| `field` | Enum | `BOOTCAMP`, `PROFESSIONAL`은 NOT NULL, 그 외는 null | 공부하는 분야 또는 직무. `FRONTEND`, `BACKEND`, `ANDROID`, `IOS`, `DATA_AI`, `DESIGN`, `PRODUCT`, `ETC` |
| `career` | Enum | `PROFESSIONAL`은 NOT NULL, 그 외는 null | `UNDER_1`, `YEARS_1_3`, `YEARS_4_6`, `YEARS_7_PLUS` |
| `company` | Embedded `Company` | `PROFESSIONAL`만 선택 입력, 그 외는 null | 회사명(50자 이하)과 참여자 목록 공개 여부 |
| `withdrawnAt` | LocalDateTime | nullable | 탈퇴 시각. MVP에는 탈퇴 기능이 없어 현재 사용하지 않음 |
| `joinedAt` | LocalDateTime | NOT NULL | 서비스 가입 시각 |
| `updatedAt` | LocalDateTime | NOT NULL | 최종 수정 시각 |

## Member 모델 규칙
- `generation`은 사용자가 수정할 수 없다. 크루는 양수 기수가 필수이고, 그 외 회원은 기수를 저장하지 않는다. 기수는 크루 명단 인증 때만 명단 값으로 채워진다.
- 별도 `OauthAccount` 엔티티를 두지 않는다. GitHub 인증 정보 중 사용자 식별에 필요한 `githubId`를 `Member`가 직접 보유한다.
- GitHub 프로필 이미지는 저장하지 않고 `githubId`로 아바타 URL을 구성한다.
- 입체 캐릭터는 별도 `member_avatar` 테이블에 회원당 하나의 버전 1 파츠 조합을 저장한다.
  파츠 허용 값·누락된 확장 파츠 기본값은 `AvatarCatalog`에서 관리하고 DB에는 파츠 CHECK를 중복하지 않는다.
  프로필 이미지와 별도이며 회원 생성 시 조합을 강제로 만들지 않는다. 저장 전·삭제 후에는
  머리와 안경이 없는 기본형을 조회 시 제공한다. 삭제는 교체 가능한 설정 행을 물리적으로 제거하며
  회원 정보·프로필 사진에는 영향을 주지 않는다. [API 계약](../../api/endpoints/member-avatar.md)을 따른다.
- `memberType = CREW`이면 `course`와 양수 `generation`을 저장하고, `memberType = COACH`이면 둘 다 저장하지 않는다.
- `BOOTCAMP`는 부트캠프 정보와 분야를, `PROFESSIONAL`은 직무와 연차를 저장하고 회사 정보는 선택이다. 두 유형 모두 `course`와 `generation`을 저장하지 않는다.
- `MEMBER`는 `course`, `generation`과 부트캠프, 분야, 연차, 회사 정보를 모두 저장하지 않는다. [크루 명단](#크루-명단)에 있으면 가입이나 GitHub 로그인 때 `CREW`가 된다.
- 크루와 코치는 부트캠프, 분야, 연차, 회사 정보를 저장하지 않는다. DB의 `ck_member_profile_fields`가 유형별 조합을 함께 강제한다.
- 가입은 닉네임만 받는다. 크루 명단에 있으면 `CREW`, 없으면 `MEMBER`로 가입한다. 사용자가 크루 여부나 기수, 과정을 직접 정할 수 없다. 코치 선택지는 없지만 가입 API는 `COACH`를 그대로 받는다.
- `BOOTCAMP`, `PROFESSIONAL`은 더 이상 새로 만들지 않는다. 기존 회원은 V29에서 `MEMBER`로 옮겼고, 소속 컬럼은 Contract 단계에서 지울 때까지 비워 둔다.

## 크루 명단

`crew_roster`는 우테코 크루 명단이다. 크루 인증에 필요한 값만 저장하고 크루 닉네임과 GitHub 로그인 이름은 저장하지 않는다.

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 명단 행 식별자 |
| `githubId` | String | NOT NULL, UNIQUE | `Member.githubId`와 같은 GitHub 숫자 ID |
| `generation` | Integer | NOT NULL, 양수 | 기수 |
| `course` | Enum | NOT NULL | `BACKEND`, `FRONTEND`, `ANDROID` |

- 명단은 운영자가 저장소 밖 CSV를 [명단 적재 절차](../../../operations/crew-roster.md)로 넣는다. 애플리케이션은 명단을 읽기만 한다.
- 명단 인증은 기본 멤버, 부트캠프 회원, 현직자에게만 적용한다. 닉네임은 유지하고 `generation`, `course`는 명단 값을 쓰며 소속 정보는 비운다.
- 같은 기수에 같은 닉네임의 크루가 이미 있으면 인증하지 않는다. 가입이면 닉네임 중복(409)으로 다시 입력받고, 로그인이면 기본 멤버로 둔 채 로그인을 계속한다.
- 이미 `CREW`나 `COACH`인 회원은 명단과 기수, 과정이 달라도 바꾸지 않는다.
- 인증 시점은 가입, GitHub 로그인, 명단 적재 스크립트 실행 세 곳이다. Refresh Token으로 Access Token만 다시 받을 때는 대조하지 않는다.
