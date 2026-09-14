# API 엔드포인트 설계

> 상태: 저장소 최신 설계 기준
>
> 구현·테스트·Swagger/OpenAPI와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

이 문서는 저장소에서 관리하는 활성 엔드포인트 26개를 하나의 AI 맥락 문서로 정리한 것이다. 세부 요청·응답·오류는 구현 시 Swagger/OpenAPI와 RestAssured 인수 테스트로 검증한다.

이 디렉터리는 API 엔드포인트의 전체 목록과 리소스별 상세 설계를 관리한다. 모든 엔드포인트는 [API 공통 설계](../common-contract.md)를 따르며, 상세 문서에는 엔드포인트 고유 내용만 둔다.

## 전체 목록

| 분류 | Method | Endpoint | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 가입 신청 | `GET` | `/api/recruitments/{recruitmentId}/registrations` | `LEADER` | 모집 공고 신청자 목록 조회 |
| 가입 신청 | `POST` | `/api/recruitments/{recruitmentId}/registrations` | `MEMBER` | 모집 공고에 가입 신청 |
| 가입 신청 | `DELETE` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `MEMBER` | 내 대기 중 가입 신청 철회 |
| 가입 신청 | `PATCH` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `LEADER` | 가입 신청 승인·거절 |
| 가입 신청 | `GET` | `/api/registrations?applicant=me` | `MEMBER` | 내 가입 신청 목록 조회 |
| 그룹 | `GET` | `/api/groups` | `PUBLIC` | 그룹 목록 조회 — 관계·상태·유형 필터 지원 |
| 그룹 | `POST` | `/api/groups` | `MEMBER` | 그룹 개설 |
| 그룹 | `DELETE` | `/api/groups/{groupId}` | `LEADER` | 생성 후 24시간 이내 그룹 삭제 |
| 그룹 | `GET` | `/api/groups/{groupId}` | `PUBLIC` | 그룹 상세 조회 |
| 그룹 | `PATCH` | `/api/groups/{groupId}` | `LEADER` | 생성 후 24시간이 지난 그룹 종료 |
| 그룹 | `PUT` | `/api/groups/{groupId}` | `LEADER` | 그룹 기본 정보 전체 교체 |
| 그룹 | `DELETE` | `/api/groups/{groupId}/recurring-schedule` | `LEADER` | 동아리·스터디를 유동적 일정으로 변경 |
| 그룹 | `PUT` | `/api/groups/{groupId}/recurring-schedule` | `LEADER` | 동아리·스터디 반복 일정 등록 또는 교체 |
| 그룹 | `PUT` | `/api/groups/{groupId}/session-schedule` | `LEADER` | 세션 일정 교체 |
| 그룹 구성원 | `GET` | `/api/groups/{groupId}/members` | `PUBLIC` | 그룹 구성원 목록 조회 |
| 그룹 구성원 | `PUT` | `/api/groups/{groupId}/leader` | `LEADER` | 모임장 역할 위임 |
| 모집 공고 | `GET` | `/api/groups/{groupId}/recruitments` | `PUBLIC` | 그룹의 모집 공고 이력 조회 |
| 모집 공고 | `POST` | `/api/groups/{groupId}/recruitments` | `LEADER` | 새 모집 공고 등록 |
| 모집 공고 | `GET` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `PUBLIC` | 모집 공고 상세 조회 |
| 모집 공고 | `PATCH` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `LEADER` | 모집 공고 조기 마감 |
| 이미지 | `POST` | `/api/image-uploads` | `MEMBER` | 이미지 업로드 리소스 생성 |
| 인증·회원 | `POST` | `/api/auth/logout` | `AUTH` | 가입 세션 또는 Refresh Token 무효화 |
| 인증·회원 | `POST` | `/api/auth/refresh` | `PUBLIC` | Access Token 재발급 |
| 인증·회원 | `POST` | `/api/members` | `AUTH` | 회원 가입 완료 |
| 인증·회원 | `GET` | `/api/members/me` | `AUTH` | 내 정보와 가입 완료 여부 조회 |
| 인증·회원 | `GET` | `/api/oauth/github/callback` | `PUBLIC` | GitHub OAuth 콜백 처리 |

## 상세 문서

| 분류 | 문서 | 내용 |
| --- | --- | --- |
| 인증·회원 | [auth-members.md](auth-members.md) | 인증과 회원 엔드포인트 |
| 그룹 | [groups.md](groups.md) | 그룹과 일정 엔드포인트 |
| 모집 공고 | [recruitments.md](recruitments.md) | 모집 공고 엔드포인트 |
| 가입 신청 | [registrations.md](registrations.md) | 가입 신청 엔드포인트 |
| 그룹 구성원 | [group-members.md](group-members.md) | 그룹 구성원 엔드포인트 |
| 이미지 | [images.md](images.md) | 이미지 업로드 엔드포인트 |
