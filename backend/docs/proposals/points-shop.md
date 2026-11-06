# 포인트 상점 계약 초안

이 문서는 향후 상점에서 사용할 설계 초안이다. 현재 공개된 포인트 조회 및 적립 API는 [포인트 API](../context/api/endpoints/points.md)에 정리한다.

같은 백엔드와 DB에서 상점이 `spend(memberId, purchaseId, amount)`를 호출한다. 서버 가격을 사용하며 차감 거래 ID, 차감액, 차감 직후 잔액을 반환한다. 구매, 차감, 에셋 지급을 함께 커밋한다. 동일 구매 UUID는 기존 결과를 반환한다. 다른 상품에 사용하면 `409 PURCHASE_ID_CONFLICT`, 보유 중인 에셋을 새로 구매하면 `409 ASSET_ALREADY_OWNED`, 부족한 잔액은 `409 INSUFFICIENT_POINTS`다. 동시성 충돌은 `409 CONCURRENT_MODIFICATION`, 일시적 장애는 `503 POINTS_TEMPORARILY_UNAVAILABLE`로 구분한다. 취소 시 차감당 1회 복구와 에셋 회수, 장착 해제를 같은 트랜잭션에서 처리한다.

[포인트 도메인 모델](../context/domain/model/points.md)
