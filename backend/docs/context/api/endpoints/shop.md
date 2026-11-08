# 상점 구매 API

## 범위와 선행 조건

`#589`의 `point_wallet(member_id, balance)`와 같은 PostgreSQL 트랜잭션을 사용한다.
검토 기준 커밋은 `614760b58255c079865c0dcafbf18045896e6c33`이다. 적립 코드를 복제하거나
포인트 테이블을 이 PR의 운영 마이그레이션에서 생성하지 않는다.
`jarihana.shop.enabled`는 기본 false다. 설정이 true이고 point_wallet이 있어야 구매 가능하다.
상품은 운영 DB에 자동 등록하지 않는다. 기존 무료 아바타 파츠와 체험 상품을 실제 판매하지 않는다.

현재 develop V24(토론 인덱스), #566 V24(아바타), #589 V24~26이 충돌한다.
상점 파일은 임시 V29로 분리했으나 **#566·#589의 번호 확정·통합 후 전체 마이그레이션 검증 전에는
이 PR을 배포하지 않는다**. 높은 번호를 먼저 배포하면 후속 낮은 버전이 적용되지 않는다.
기적용 Flyway 파일을 변경하거나 outOfOrder/repair로 우회하지 않는다.

## 엔드포인트

| 메서드 | 경로 (/api 접두사) | 권한 | 응답 |
| --- | --- | --- | --- |
| GET | /shop/products | PUBLIC | 200: purchasingEnabled, categories, products |
| GET | /members/me/shop | MEMBER | 200: wallet, inventory |
| POST | /members/me/shop/purchases | MEMBER + CSRF | 201: purchaseId, productId, wallet, inventory |

상품 조회는 작은 전체 카탈로그를 반환하는 화면 설정 리소스다. 구매 이력 목록 API가 아니다.
구매자 ID는 인증 쿠키에서만 읽는다. 가격·지급 아이템은 요청으로 받지 않는다.

```json
{"productId":"offer-id","termsVersion":"서버가 반환한 조건 해시","requestId":"4e3d654a-9f57-4cd1-9113-1d92dad97f23"}
```

- productId, termsVersion: 필수, 1~64자. requestId: 필수 UUID.
- 상품: id, name, description, categoryId, price(1~JS 안전 정수 상한), termsVersion,
  status(AVAILABLE/ENDED), preview(type/art/tone/appearance), grant(itemId/slot).
- preview와 슬롯은 [프론트 계약](../../../../../frontend/src/entities/shop/index.js)의 지원 목록만 등록한다.
- 조건 해시는 서버의 JSON 상품 정의와 판매 여부 전체로 계산한다. 가격·지급·설명이 달라지면 자동 변경된다.
- wallet: `{balance: 700, unit: "P"}`. inventory: `{items: [...], equipped: {}}`.
- items는 구매 시점의 이름·설명·미리보기·categoryId·itemId·slot을 보존한다.
- 실제 장착/프로필 적용 API는 별도다. 구매 API는 보유 권리를 지급하고 아바타를 자동 수정하지 않는다.
  현재 예시 상품은 체험 전용이며 실제 판매 상품 등록에는 해당 에셋의 사용 경로 구현도 필요하다.

## 원자성·재시도

1. READ COMMITTED 트랜잭션에서 회원 잔액 행을 생성 또는 잠근다.
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
| PRODUCT_UNAVAILABLE | 409 | 없는 상품 또는 판매 종료 |
| TERMS_CHANGED | 409 | 가격·지급 조건 변경 |
| ALREADY_OWNED | 409 | 같은 아이템 보유 |
| INSUFFICIENT_POINTS | 409 | 잔액 부족 |
| REQUEST_CONFLICT | 409 | 같은 키의 입력 불일치 |
| SHOP_UNAVAILABLE | 503 | 판매 설정 꺼짐 또는 포인트 스키마 미적용 |

## 검증과 남은 결정

ShopPurchaseAcceptanceTest: PostgreSQL HTTP 인수 테스트로 중복 요청·동시 지출·동시 적립 SQL,
가격 신뢰 경계·조건 변경·계정 분리·인증/CSRF·지급 실패 롤백을 확인한다.
ShopDisabledAcceptanceTest: 기본 판매 중지. FlywayBaselineTest: 기존 스키마 업그레이드와 이력 보존.
#589가 아직 병합 전이므로 테스트 전용 fixture가 그 PR의 point_wallet DDL을 사용한다.
실제 적립 워커 전체와 함께 실행한 통합 검증, 운영 DB, 구버전 앱 이미지 실행은 별도 확인이다.

포인트 담당자에게 확인할 것은 (1) 공용 잔액 행을 잠그고 같은 DB에서 차감하는 계약,
(2) 적립 원장과 구매 차감 원장의 대사·내역 노출, (3) 선행 PR 마이그레이션 번호와 병합 순서다.
확정 판매 상품·가격, 환불/소비형 아이템, 유료 에셋 적용·소유권 검사는 후속 범위다.
