# Member

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 회원 식별자 |
| `crewName` | String | NOT NULL, 한글 2–4자, 공백·특수문자 불가 | 우테코 크루 닉네임 |
| `memberType` | Enum | NOT NULL | `CREW`, `COACH`, `BOOTCAMP`(부트캠프 수강생, 수료생), `PROFESSIONAL`(IT 현직자) |
| `generation` | Integer | `CREW`는 NOT NULL·수정 불가, `COACH`는 null | 기수 |
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
- `generation`은 사용자가 수정할 수 없다. 일반 회원은 양수 기수가 필수이고, `COACH` 회원은 기수를 저장하지 않는다.
- 별도 `OauthAccount` 엔티티를 두지 않는다. GitHub 인증 정보 중 사용자 식별에 필요한 `githubId`를 `Member`가 직접 보유한다.
- GitHub 프로필 이미지는 저장하지 않고 `githubId`로 아바타 URL을 구성한다.
- `memberType = CREW`이면 `course`와 양수 `generation`을 저장하고, `memberType = COACH`이면 둘 다 저장하지 않는다.
- `BOOTCAMP`는 부트캠프 정보와 분야를, `PROFESSIONAL`은 직무와 연차를 저장하고 회사 정보는 선택이다. 두 유형 모두 `course`와 `generation`을 저장하지 않는다.
- 크루와 코치는 부트캠프, 분야, 연차, 회사 정보를 저장하지 않는다. DB의 `ck_member_profile_fields`가 유형별 조합을 함께 강제한다.
- 가입 화면은 우테코 크루를 부트캠프 목록의 우아한테크코스와 크루 인증 단계로만 받는다. 코치 선택지는 없지만 가입 API는 `COACH`를 그대로 받는다.
