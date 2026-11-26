# 그룹 공유 미리보기

### `GET /api/share/groups/{groupId}`

- 설명: 그룹별 소셜 공유 미리보기에 필요한 HTML 메타데이터 반환
- 권한: `PUBLIC`
- 응답 형식: `text/html`

응답의 `<head>`에는 `og:title`, `og:description`, `og:url`, `og:image`와
`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`를 포함한다.
`og:url`은 프론트엔드의 `/groups/{groupId}` canonical URL이다. 브라우저에서만 실행되는
스크립트가 원래 주소의 유효한 `promotion_id` 하나만 보존해
`/groups/{groupId}?preview=1&promotion_id=...`로 이동하며, JavaScript를 실행하지 않는
크롤러는 첫 HTML의 메타데이터를 그대로 읽는다. canonical과 OG URL에는 쿼리를 포함하지
않는다.

CloudFront viewer-request 함수가 일반 `/groups/{groupId}` 요청을 이 엔드포인트로
연결해야 한다. `/api/share/groups/{groupId}`를 직접 호출해도 같은 HTML을 반환한다.

그룹이 없으면 기존 공통 오류 봉투의 `GROUP_NOT_FOUND`와 HTTP 404를 반환한다.

소속 공개와 비공개 모임은 조회자와 관계없이 모임 이름, 소개, 대표 이미지를 담지 않은 일반 미리보기
(`og:title`은 `자리하나`, 기본 이미지)를 반환하고 같은 방식으로 모임 페이지로 넘긴다. CloudFront가 모든
`/groups/{groupId}` 첫 요청을 이 응답으로 처리하고 5분 동안 공개 캐시에 두므로, 404를 반환하면 그 소속
회원과 구성원도 직접 주소로 들어올 수 없고, 조회자에 따라 내용을 바꾸면 소속 회원이 받은 미리보기가 캐시를
거쳐 다른 사람에게 보일 수 있기 때문이다. 실제로 볼 수 있는지는 넘어간 화면이 모임 API를 호출할 때 다시 판단한다.
