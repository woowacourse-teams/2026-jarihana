# Invitation · InvitationAcceptance

> 상태: 저장·발급·회원 후보·수신/발급 목록·상세·공개 미리보기·취소 구현. 실제 수락·합류 연결은 아직 미구현이다.
> 모델 분리와 승인 출처 선택은 [ADR 0017](../../../adr/0017-separate-invitation-acceptance-history.md)을 따른다.

## Invitation

모임의 현재 구성원이 다른 사람에게 합류를 제안한 기록이다.
모집 신청 Registration과 달리 모집 공고를 요구하지 않으며 실제 소속은 GroupMember로 표현한다.

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Long | PK | 초대 식별자 |
| groupId | Long | NOT NULL | 합류할 그룹 |
| inviterMemberId | Long | NOT NULL | 초대를 발급한 회원 |
| type | Enum | NOT NULL | DIRECT 또는 LINK |
| targetMemberId | Long | DIRECT 필수, LINK null | 지정 초대의 대상 회원 |
| requestId | UUID | NOT NULL, 발급자와 조합 유일 | 발급 요청 재시도 식별자 |
| tokenHash | String | LINK 필수, 64자리 소문자 hex, 유일 | 공유 토큰 조회용 해시 저장값 |
| encryptedToken | String | LINK 필수, 최대 512자 | 같은 링크 재복사를 위한 암호문 저장 공간 |
| createdAt | LocalDateTime | NOT NULL | 발급 시각 |
| expiresAt | LocalDateTime | DIRECT null, LINK 필수 | 공유 링크의 시간 만료 기준 |
| revokedAt | LocalDateTime | nullable | 최초 취소 시각 |

DIRECT의 토큰 저장 필드는 null이다. LINK는 32바이트 난수의 패딩 없는 Base64URL 토큰을 발급한다.
조회용 SHA-256 해시와 AES-256-GCM 암호문을 저장하고 같은 발급 요청 재시도에서 원래 링크를 복원한다.
키 ID와 환경 설정의 키 목록을 사용하며 모든 현재 모임원이 공유 초대 상세에서 기존 링크를 복원할 수 있다. 재복사는 만료 시각을 연장하지 않는다.
선택 이유와 키 관리 비용은 [백엔드 ADR 0018](../../../adr/0018-encrypted-invitation-token-storage.md)을 따른다.

## 모델 규칙

- DIRECT는 특정 가입 완료 회원을 대상으로 하며 대상은 발급 후 바꾸지 않는다.
- LINK는 링크 소지자를 대상으로 한다. 첫 수락으로 초대 자체가 소비되지 않는다.
- DIRECT는 시간 만료가 없고 LINK는 초기 약 3일의 유효 기간을 가진다.
  발급 시각+72시간이며 now >= expiresAt부터 만료다.
- revokedAt이 있으면 신규 합류를 허용하지 않는다. 취소는 과거 합류를 되돌리지 않는다.
- revoke는 원본을 변경하지 않고 최초 취소 시각을 가진 새 엔티티를 반환한다. 이미 취소된 경우 최초 시각을 유지한다. 취소 시각은 발급 이전일 수 없다.
- 발급·수락·취소 흐름과 권한은 [비즈니스 정책](../business-policies.md#초대-발급과-합류)을 따른다.
- 모델 간 유일성과 모집 집계 관계는 [불변식](../invariants.md#invitation--groupmember--registration)을 따른다.

## InvitationAcceptance

초대를 통해 실제 소속을 새로 만든 합류 사건이다. 이미 참여 중인 사람의 재수락은 새 사건이 아니다.

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Long | PK | 수락 이력 식별자 |
| invitationId | Long | NOT NULL | 합류에 사용한 초대 |
| memberId | Long | NOT NULL | 수락한 회원 |
| acceptedAt | LocalDateTime | NOT NULL | 실제 신규 합류 시각 |

같은 invitationId·memberId는 유일하다. 생성 시 지정 대상 일치와 발급 이후 수락 시각을 검증한다.
현재 소속·만료·취소 검증과 소속 생성의 원자적 연결은 6단계의 수락 서비스에서 구현한다.

## 모델 관계와 조회 상태

- Group → Invitation은 1:N이며 하나의 초대는 발급자 Member를 가진다.
- DIRECT만 대상 Member를 지정한다. LINK는 여러 회원의 수락 이력을 가질 수 있다.
- InvitationAcceptance는 초대와 수락 회원을 추적하며 소속 상태를 별도로 복제하지 않는다.
- 같은 그룹/회원의 GroupMember는 초대 개수와 관계없이 하나다.
- 조회 상태 ACTIVE·ACCEPTED·EXPIRED·REVOKED·GROUP_ENDED는 초대와 관련 모델의 현재 상태를 해석한 결과다.
  이탈한 발급자의 초대는 EXPIRED로 안내하고 ACCEPTED는 DIRECT에만 적용한다.
- 복합 상태 표시 우선순위는 REVOKED → GROUP_ENDED → EXPIRED → DIRECT ACCEPTED → ACTIVE다.
  JSON 필드는 [초대 API](../../api/endpoints/invitations.md)에 정의한다.
- 그룹 물리 삭제에 따른 초대/수락 이력 정리는 기존 그룹 생명주기를 따르며 저장 순서는 백엔드 ADR에서 정한다.
- 개인 초대 메시지는 저장하지 않는다. 거절 상태와 거절 이력은 없으며 알림 삭제는 초대 상태를 변경하지 않는다.
