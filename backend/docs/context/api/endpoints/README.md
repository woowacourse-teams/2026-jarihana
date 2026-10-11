# API 엔드포인트 설계

> 상태: 저장소 최신 설계 기준
>
> 구현·테스트와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

이 문서는 저장소에서 관리하는 활성 엔드포인트 56개를 하나의 AI 맥락 문서로 정리한 것이다. 세부 요청·응답·오류는 Controller·요청/응답 DTO·ErrorCode와 RestAssured 인수 테스트로 확인한다.

이 디렉터리는 API 엔드포인트의 전체 목록과 리소스별 상세 설계를 관리한다. 모든 엔드포인트는 [API 공통 설계](../common-contract.md)를 따르며, 상세 문서에는 엔드포인트 고유 내용만 둔다.

## 전체 목록

| 분류 | Method | Endpoint | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 초대 | `POST` | `/api/groups/{groupId}/invitations` | `MEMBER + 현재 소속` | 활성 모임의 지정/공유 초대 발급과 요청 재시도 처리 |
| 초대 | `GET` | `/api/groups/{groupId}/invitation-candidates` | `MEMBER + 현재 소속` | 활성 모임의 지정 초대 후보를 제한된 회원 정보로 검색 |
| 초대 | `GET` | `/api/invitations/received` | `MEMBER` | 본인에게 온 지정 초대와 현재 상태 조회 |
| 초대 | `GET` | `/api/groups/{groupId}/invitations` | `MEMBER + 현재 소속` | 본인 발급 초대 또는 모든 구성원이 볼 수 있는 모임의 공유 링크 목록 |
| 초대 | `GET` | `/api/invitations/{invitationId}` | `MEMBER + 유형별 상세 권한` | 상태 조회와 권한 있는 공유 링크 재복사 |
| 초대 | `GET` | `/api/invitations/links/{token}` | `PUBLIC` | 공유 초대의 제한된 공개 미리보기 |
| 초대 | `PATCH` | `/api/invitations/{invitationId}/revoke` | `MEMBER + 현재 소속·유형별 취소 권한` | 초대와 미전송 푸시 작업 취소 |
| 초대 | `PATCH` | `/api/invitations/{invitationId}/decline` | `MEMBER + DIRECT 지정 대상` | 거절 상태 저장·알림 유지·재수락 차단 |
| 초대 | `POST` | `/api/invitations/{invitationId}/acceptances` | `MEMBER + 대상/토큰 자격` | 소속·수락 이력·기존 대기 신청 승인, 재수락은 기존 소속 반환 |
| 활동 기록 | `GET` | `/api/activity-posts` | `PUBLIC` | 전체 공개 사진 활동 기록을 활동 날짜 최신순으로 조회 |
| 활동 기록 | `GET` | `/api/groups/{groupId}/activity-posts` | `PUBLIC` | 그룹 사진 활동 기록 조회 |
| 활동 기록 | `POST` | `/api/groups/{groupId}/activity-posts` | `MEMBER` | 활성 그룹 구성원의 사진 활동 기록 작성 |
| 활동 기록 | `PUT` | `/api/activity-posts/{postId}` | `MEMBER` | 작성자 또는 현재 모임장이 사진 활동 기록 수정 |
| 활동 기록 | `DELETE` | `/api/activity-posts/{postId}` | `MEMBER` | 작성자 또는 현재 모임장이 사진 활동 기록 숨김 |
| 피드백 | `POST` | `/api/feedbacks` | `MEMBER` | 피드백 작성 |
| 가입 신청 | `GET` | `/api/groups/{groupId}/registrations/summary` | `LEADER` | 그룹의 미확인·처리 대기 신청 요약 조회 |
| 가입 신청 | `PATCH` | `/api/recruitments/{recruitmentId}/registrations/read` | `LEADER` | 확인한 마지막 신청까지 읽음 처리 |
| 가입 신청 | `GET` | `/api/recruitments/{recruitmentId}/registrations` | `LEADER` | 모집 공고 신청자 목록 조회 |
| 가입 신청 | `POST` | `/api/recruitments/{recruitmentId}/registrations` | `MEMBER` | 모집 공고에 가입 신청 |
| 가입 신청 | `DELETE` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `MEMBER` | 내 대기 중 가입 신청 철회 |
| 가입 신청 | `PATCH` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `LEADER` | 가입 신청 승인·미승인 |
| 가입 신청 | `GET` | `/api/registrations?applicant=me` | `MEMBER` | 내 가입 신청 목록 조회 |
| 그룹 | `GET` | `/api/groups` | `PUBLIC` | 그룹 목록 조회 — 관계·상태·유형 필터 지원 |
| 그룹 | `POST` | `/api/groups` | `MEMBER` | 그룹 개설 |
| 그룹 | `DELETE` | `/api/groups/{groupId}` | `LEADER` | 생성 후 24시간 이내 그룹 삭제 |
| 그룹 | `GET` | `/api/groups/{groupId}` | `PUBLIC` | 그룹 상세 조회 |
| 공유 미리보기 | `GET` | `/api/share/groups/{groupId}` | `PUBLIC` | 그룹별 Open Graph/Twitter 메타데이터 HTML 반환 |
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
| 모집 공고 | `PUT` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `LEADER` | 현재 모집의 기간·정원·승인 방식 수정 |
| 모집 공고 | `PATCH` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `LEADER` | 모집 공고 조기 마감 |
| 이미지 | `POST` | `/api/image-uploads` | `MEMBER` | 이미지 업로드 리소스 생성 |
| 인증·회원 | `POST` | `/api/auth/logout` | `AUTH` | 가입 세션 또는 Refresh Token 무효화 |
| 인증·회원 | `POST` | `/api/auth/refresh` | `PUBLIC` | Access Token 재발급 |
| 인증·회원 | `POST` | `/api/members` | `AUTH` | 회원 가입 완료 |
| 인증·회원 | `GET` | `/api/members/me` | `AUTH` | 내 정보와 가입 완료 여부 조회 |
| 인증·회원 | `GET` | `/api/oauth/github/callback` | `PUBLIC` | GitHub OAuth 콜백 처리 |
| 알림함 | `GET` | `/api/notifications` | `MEMBER` | 본인 알림 목록 조회 |
| 알림함 | `GET` | `/api/notifications/{id}` | `MEMBER` | 본인 알림과 이동 대상 조회 |
| 알림함 | `GET` | `/api/notifications/unread-count` | `MEMBER` | 안 읽은 알림 수 |
| 알림함 | `PATCH` | `/api/notifications/{id}/read` | `MEMBER` | 개별 읽음 |
| 알림함 | `PATCH` | `/api/notifications/read-all` | `MEMBER` | 전체 읽음 |
| 알림함 | `DELETE` | `/api/notifications/{id}` | `MEMBER` | 개별 삭제와 미완료 전송 취소 |
| 웹푸시 | `GET` | `/api/push-config` | `MEMBER` | 사용 가능 여부와 VAPID 공개키 |
| 웹푸시 | `GET` | `/api/push-subscriptions` | `MEMBER` | 본인의 브라우저 연결 목록 |
| 웹푸시 | `POST` | `/api/push-subscriptions` | `MEMBER` | 현재 브라우저 구독 등록·갱신 |
| 웹푸시 | `DELETE` | `/api/push-subscriptions/{id}` | `MEMBER` | 구독 해제와 과거 연결의 미완료 전송 취소 |
| 웹푸시 | `GET` | `/api/notifications/{id}/push-content` | `MEMBER` | 본인 알림·활성 구독·현재 연결 버전 검증 후 내용 조회 |

## 상세 문서

### 활성 API 상세

| 분류 | 문서 | 내용 |
| --- | --- | --- |
| 초대 | [invitations.md](invitations.md) | 발급·회원 후보·수신/발급 목록·상세·공개 미리보기·취소·수락·대기 신청 승인 |
| 피드백 | [feedbacks.md](feedbacks.md) | 피드백 작성 |
| 인증·회원 | [auth-members.md](auth-members.md) | 인증과 회원 엔드포인트 |
| 그룹 | [groups.md](groups.md) | 그룹과 일정 엔드포인트 |
| 모집 공고 | [recruitments.md](recruitments.md) | 모집 공고 엔드포인트 |
| 가입 신청 | [registrations.md](registrations.md) | 가입 신청 엔드포인트 |
| 그룹 구성원 | [group-members.md](group-members.md) | 그룹 구성원 엔드포인트 |
| 이미지 | [images.md](images.md) | 이미지 업로드 엔드포인트 |
| 활동 기록 | [activity-posts.md](activity-posts.md) | 사진 활동 기록 조회·작성·수정·숨김 |
| 공유 미리보기 | [share-preview.md](share-preview.md) | 그룹 공유 미리보기 HTML 엔드포인트 |
| 알림함·웹푸시 | [notifications.md](notifications.md) | 알림함·구독·푸시 내용 조회·로그아웃 호환 확장 |
