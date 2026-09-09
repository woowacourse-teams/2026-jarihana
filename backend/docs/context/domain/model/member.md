# Member

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 회원 식별자 |
| `crewName` | String | NOT NULL, 한글 2–4자, 공백·특수문자 불가 | 우테코 크루 닉네임 |
| `memberType` | Enum | NOT NULL | `CREW` 또는 `COACH` |
| `generation` | Integer | `CREW`는 NOT NULL·수정 불가, `COACH`는 null | 기수 |
| `githubId` | String | NOT NULL, UNIQUE | 변경되지 않는 GitHub 사용자 숫자 ID |
| `course` | Enum | `CREW`는 NOT NULL, `COACH`는 null | `BACKEND`, `FRONTEND`, `ANDROID` |
| `withdrawnAt` | LocalDateTime | nullable | 탈퇴 시각. MVP에는 탈퇴 기능이 없어 현재 사용하지 않음 |
| `joinedAt` | LocalDateTime | NOT NULL | 서비스 가입 시각 |
| `updatedAt` | LocalDateTime | NOT NULL | 최종 수정 시각 |

## Member 모델 규칙
- `generation`은 사용자가 수정할 수 없다. 일반 회원은 양수 기수가 필수이고, `COACH` 회원은 기수를 저장하지 않는다.
- 별도 `OauthAccount` 엔티티를 두지 않는다. GitHub 인증 정보 중 사용자 식별에 필요한 `githubId`를 `Member`가 직접 보유한다.
- GitHub 프로필 이미지는 저장하지 않고 `githubId`로 아바타 URL을 구성한다.
- `memberType = CREW`이면 `course`와 양수 `generation`을 저장하고, `memberType = COACH`이면 둘 다 저장하지 않는다.
