# Invitation · InvitationAcceptance

> 상태: 저장·발급·회원 후보·수신/발급 목록·상세·공개 미리보기·취소 구현. 수락·합류·기존 대기 신청 승인도 구현했다.
> 모델 분리와 승인 출처 선택은 [ADR 0017](../../../adr/0017-separate-invitation-acceptance-history.md)을 따른다.

## Invitation

모임의 현재 구성원이 다른 사람에게 합류를 제안한 기록이다.
모집 신청 Registration과 달리 모집 공고를 요구하지 않으며 실제 소속은 GroupMember로 표현한다.

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Long | PK | 초대 식별자 |
| version | Long | NOT NULL, 영속화 전 null | 취소와 수락 사이의 낙관적 상태 검증 버전 |
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
| state | InvitationState | status 컬럼, VALID·REJECTED·CANCELED | 유효·수신자 거절·발급자 취소 상태 |

DIRECT의 토큰 저장 필드는 null이다. LINK는 32바이트 난수의 패딩 없는 Base64URL 토큰을 발급한다.
조회용 SHA-256 해시와 AES-256-GCM 암호문을 저장하고 같은 발급 요청 재시도에서 원래 링크를 복원한다.
키 ID와 환경 설정의 키 목록을 사용하며 모든 현재 모임원이 공유 초대 상세에서 기존 링크를 복원할 수 있다. 재복사는 만료 시각을 연장하지 않는다.
선택 이유와 키 관리 비용은 [백엔드 ADR 0018](../../../adr/0018-encrypted-invitation-token-storage.md)을 따른다.

## 모델 규칙

- 취소·거절 상태 전이는 읽은 버전을 보존한다. 수락은 초대·모임 버전을 검증하며 지정 초대 수락만 초대 버전을 증가시켜 거절과의 경쟁을 감지한다. 공유 링크 수락은 버전을 증가시키지 않는다. 충돌 처리의 선택과 비용은 [백엔드 ADR 0019](../../../adr/0019-optimistic-invitation-acceptance.md)를 따른다.
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
수락 서비스에서 대상 ID·공유 토큰 자격을 확인하고 소속·수락 이력·기존 PENDING 승인을 원자적으로 저장한다. 프록시 대상 비교에는 ID getter를 사용하며 회원 전체의 equals 정책을 바꾸지 않는다.

## 모델 관계와 조회 상태

- 한 모임의 유효한 LINK는 최대 하나다. 발급 서비스가 기존 모임 잠금 안에서 유효 링크를 확인해 반환하거나 새로 만든다. 서로 다른 회원의 동시 발급도 같은 링크를 받으며 재사용은 expiresAt을 연장하지 않는다.
- 발급자는 최초 생성자로 유지한다. 공유 링크는 모임 공동으로 사용하더라도 발급자 이탈 시 EXPIRED로 무효화하는 기존 정책을 유지한다.

- Group → Invitation은 1:N이며 하나의 초대는 발급자 Member를 가진다.
- DIRECT만 대상 Member를 지정한다. LINK는 여러 회원의 수락 이력을 가질 수 있다.
- InvitationAcceptance는 초대와 수락 회원을 추적하며 소속 상태를 별도로 복제하지 않는다.
- 같은 그룹/회원의 GroupMember는 초대 개수와 관계없이 하나다.
- 조회 상태 VALID·ACCEPTED·REJECTED·EXPIRED·CANCELED·GROUP_ENDED는 초대와 관련 모델의 현재 상태를 해석한 결과다.
  이탈한 발급자의 초대는 EXPIRED로 안내하고 ACCEPTED는 DIRECT에만 적용한다.
- 복합 상태 표시 우선순위는 DIRECT REJECTED → CANCELED → GROUP_ENDED → EXPIRED → DIRECT ACCEPTED → VALID다.
  JSON 필드는 [초대 API](../../api/endpoints/invitations.md)에 정의한다.
- 그룹 물리 삭제는 기존 그룹 생명주기를 따른다. 같은 삭제 트랜잭션에서 미완료 초대 푸시 전송을 취소하고 수락 이력 → 초대 → 기존 연관 데이터 → 그룹 순서로 정리한다. 초대 알림은 유지한다. 구조 결정은 [백엔드 ADR 0017](../../../adr/0017-separate-invitation-acceptance-history.md), 삭제와 수락의 경쟁 처리는 [백엔드 ADR 0019](../../../adr/0019-optimistic-invitation-acceptance.md)를 따른다.
- 개인 초대 메시지는 저장하지 않는다. 지정 초대의 decline은 원본을 변경하지 않고 REJECTED 상태의 새 엔티티를 반환하며 재거절은 같은 상태를 유지한다. 공유 초대와 발급 이전 거절 시각을 거부한다. 알림 삭제는 초대 상태를 변경하지 않는다.
