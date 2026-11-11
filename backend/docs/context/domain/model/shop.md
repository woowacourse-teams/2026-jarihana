# Shop

- ShopProduct: 서버 관리 상품 정의와 판매 상태. 조건 버전은 정의의 해시다.
- ShopPurchase: 완료 구매, 포인트 차감 원장, 영구 보유 권리의 한 행이다.
  회원/requestId와 회원/itemId가 각각 유일하며 구매 시점 상품 스냅샷을 보존한다.
- point_wallet은 #589 소유다. 상점은 적립 행과 독립적으로 같은 잔액을 사용한다.
- 환불·만료·소비·삭제는 지원하지 않는다. 판매 종료는 available=false로 처리해 구매 이력을 보존한다.
- ShopProfileEquipment: 회원별 현재 적용한 프레임 하나. 구매 행을 참조하므로 다른 회원의 아이템을
  적용할 수 없다. 프레임 교체와 해제는 보유권이나 잔액을 바꾸지 않는다.

[API와 선행 PR 통합 조건](../../api/endpoints/shop.md)
