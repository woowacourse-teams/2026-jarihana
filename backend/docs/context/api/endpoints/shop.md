# 상점 구매 API

## 범위와 선행 조건

#589에서 추가한 `point_wallet(member_id, balance)`를 사용한다.
상점은 `V33__points.sql`로 만들어진 지갑에서 차감하고, 포인트 조회 API는 같은 잔액을 반환한다.
`jarihana.shop.enabled`는 기본 false다. 설정이 true이고 point_wallet이 있어야 구매 가능하다.
V37은 실제 카탈로그에 프로필 프레임 두 종을 등록한다. 꾸벅 곰돌이 프레임은 600P,
반짝이는 내 자리는 1,800P다. 기존 아바타 편집기의 무료 파츠는 판매 대상에서 제외한다.
상품 등록 후에도 판매 활성화와 포인트 스키마가 있어야 실제 구매할 수 있다.

마이그레이션은 develop의 포인트 V33·공지 V34·V35에 이어 상점 V36·V37을 적용한다.
회원 아바타 저장은 후속 PR #566의 V38에서 추가한다.
기존 마이그레이션 파일은 그대로 둔다.

## 엔드포인트

| 메서드 | 경로 (/api 접두사) | 권한 | 응답 |
| --- | --- | --- | --- |
| GET | /shop/products | PUBLIC | 200: purchasingEnabled, categories, products |
| GET | /members/me/shop | MEMBER | 200: wallet, inventory |
| POST | /members/me/shop/purchases | MEMBER + CSRF | 201: purchaseId, productId, wallet, inventory |
| GET | /members/me/shop/equipment | MEMBER | 200: 적용 중인 프로필 프레임 아이템 목록 |
| PUT | /members/me/shop/equipment | MEMBER + CSRF | 200: 변경 후 inventory |

상품 조회는 작은 전체 카탈로그를 반환하는 화면 설정 리소스다. 구매 이력 목록 API가 아니다.
실제 구매자는 인증 쿠키에서 결정한다. `expectedMemberId`는 확인창을 열 때의 계정과 같은지 검사한다. 가격·지급 아이템은 요청으로 받지 않는다.

```json
{"productId":"offer-id","termsVersion":"서버가 반환한 조건 해시","requestId":"4e3d654a-9f57-4cd1-9113-1d92dad97f23","expectedMemberId":42}
```

- productId, termsVersion: 필수, 1~64자. requestId: 필수 UUID. expectedMemberId: 필수 양의 정수.
- 상품: id, name, description, categoryId, price(1~JS 안전 정수 상한), termsVersion,
  status(AVAILABLE/ENDED), preview(type/art/tone/appearance), grant(itemId/slot).
- preview와 슬롯은 [프론트 계약](../../../../../frontend/src/entities/shop/index.js)의 지원 목록만 등록한다.
- 조건 해시는 서버의 JSON 상품 정의와 판매 여부 전체로 계산한다. 가격·지급·설명이 달라지면 자동 변경된다.
- wallet: `{balance: 700, unit: "P"}`. inventory: `{items: [...], equipped: {frame?: itemId}}`.
- items는 구매 시점의 이름·설명·미리보기·categoryId·itemId·slot을 보존한다.
- PUT equipment는 `{itemId, equipped}`를 받는다. 인증 회원이 구매한 프로필 프레임만 적용한다.
  새 프레임을 적용하면 이전 프레임을 교체한다. 해제는 현재 적용한 아이템과 요청 ID가 일치할 때만 수행한다.
- 구매 시에는 보유 권리를 지급한다. 구매자가 상점에서 적용한 프레임은 마이페이지 프로필 사진에 표시된다.
  보유 프레임의 적용과 조회는 판매 중지와 독립적이다.

## 원자성·재시도

1. 확인한 회원 ID가 인증된 회원 ID와 같은지 검사한다. 일치하면 READ COMMITTED 트랜잭션에서 회원 잔액 행을 생성 또는 잠근다.
2. 같은 회원/requestId 구매가 있으면 productId/termsVersion 일치를 검사한 뒤 같은 purchaseId를 반환한다.
   재응답의 잔액과 보유 목록은 최신 상태다. 원래 응답 전체를 재생하는 계약은 아니다.
3. 새 요청이면 상품 행을 FOR SHARE로 읽어 판매 중 여부, 조건, 기존 보유를 검사한다.
4. `balance >= price` 조건으로 차감하고 구매·보유 스냅샷을 한 행에 저장한다.
5. 실패하면 차감과 지급 모두 롤백한다. 회원/아이템과 회원/requestId의 DB unique 제약도 둔다.

같은 키로 다른 상품/조건을 보내면 409다. 다른 키로 같은 아이템을 다시 사도 차감하지 않는다.
응답 유실 후 같은 POST를 재전송한다. 화면 재진입 후에는 GET으로 잔액과 보유를 복구한다.
적립 워커는 reward→wallet 순서, 구매는 wallet→product 순서이며 구매에서 reward 행은 잠그지 않는다.
기존 적립 원장 point_ledger는 양수 reward 전용이므로 음수를 넣지 않는다. shop_purchase.amount가
차감 원장이다. 초기 보정이 없는 계정은 `sum(point_ledger.amount) - sum(shop_purchase.amount)`로 대사한다.
#589의 /points/transactions는 현재 적립 목록이므로 구매 내역 통합은 별도 협의가 필요하다.

| 코드 | HTTP | 의미 |
| --- | --- | --- |
| INVALID_PARAMETER | 400 | 필수 필드/UUID/길이 오류 |
| UNAUTHENTICATED | 401 | 인증 없음 또는 존재하지 않는 회원 |
| ACCESS_DENIED | 403 | CSRF 검증 실패 |
| ACCOUNT_CHANGED | 409 | 확인창을 연 계정과 현재 인증 계정이 다름. 잔액과 보유를 변경하지 않음 |
| PRODUCT_UNAVAILABLE | 409 | 없는 상품 또는 판매 종료 |
| TERMS_CHANGED | 409 | 가격·지급 조건 변경 |
| ALREADY_OWNED | 409 | 같은 아이템 보유 |
| ITEM_NOT_OWNED | 409 | 적용할 수 있는 보유 프로필 프레임이 아님 |
| INSUFFICIENT_POINTS | 409 | 잔액 부족 |
| REQUEST_CONFLICT | 409 | 같은 키의 입력 불일치 |
| SHOP_UNAVAILABLE | 503 | 판매 설정 꺼짐 또는 포인트 스키마 미적용 |

## 검증과 남은 결정

ShopPurchaseAcceptanceTest: PostgreSQL HTTP 인수 테스트로 중복 요청·동시 지출·동시 적립 SQL,
가격 신뢰 경계·조건 변경·탭 간 로그인 계정 변경 시 양쪽 잔액과 보유 유지·인증/CSRF·지급 실패 롤백을 확인한다.
ShopDisabledAcceptanceTest: 기본 판매 중지. FlywayBaselineTest: 기존 스키마 업그레이드와 이력 보존.
상점 인수 테스트는 V33으로 생성된 지갑을 사용하고, 구매 후 포인트 조회 API에서 차감된 잔액을 확인한다.
운영 DB와 구버전 앱 이미지는 배포 전에 별도로 확인한다.

포인트 담당자에게 확인할 것은 (1) 공용 잔액 행을 잠그고 같은 DB에서 차감하는 계약,
(2) 적립 원장과 구매 차감 원장의 대사·내역 노출이다.
환불, 소비형 아이템과 아바타 유료 파츠 적용은 후속 범위다.
