# 토론해요 작업 이어받기

현재 구현과 판단은 [서비스 통합 문서](INTEGRATION.md)를 먼저 읽는다.
[검증 기록](QA.md)은 이전 통합 시점의 자료다. 현재 변경의 검증 결과와 남은 범위는 PR 본문을 확인한다.

- [기존 대화의 기획 맥락](prototype-history/CONTEXT.md): 사용자 요구, 수정 이유, 미결 정책
- [데모의 버전별 복원 지점](prototype-history/VERSIONS.md): v1~v11 로컬 태그와 커밋
- [백엔드 API 계약](../../backend/docs/context/api/endpoints/sparrings.md)
- [OpenAPI](../../backend/docs/openapi/sparring.yaml)
- [도메인 모델](../../backend/docs/context/domain/model/sparring.md)
- [프론트엔드 구현 지도](../../frontend/docs/IMPLEMENTATION_MAP.md)

`prototype-history/`는 데모 시점의 기록이다. 독립 서버, 브라우저 저장소,
키보드 고정 배치 등 그 문서의 실행 설명을 현재 서비스에 그대로 적용하지 않는다.
현재 서비스는 서버 DB와 공통 인증을 사용하며 입력창은 부모 문서 흐름을 따른다.
