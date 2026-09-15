# 그룹 공유 미리보기

### `GET /api/share/groups/{groupId}`

- 설명: 그룹별 소셜 공유 미리보기에 필요한 HTML 메타데이터 반환
- 권한: `PUBLIC`
- 응답 형식: `text/html`

응답의 `<head>`에는 `og:title`, `og:description`, `og:url`, `og:image`와
`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`를 포함한다.
`og:url`은 프론트엔드의 `/groups/{groupId}` canonical URL이다. 브라우저에서만 실행되는
스크립트가 `/groups/{groupId}?preview=1`로 이동하며, JavaScript를 실행하지 않는
크롤러는 첫 HTML의 메타데이터를 그대로 읽는다.

CloudFront viewer-request 함수가 일반 `/groups/{groupId}` 요청을 이 엔드포인트로
연결해야 한다. `/api/share/groups/{groupId}`를 직접 호출해도 같은 HTML을 반환한다.

그룹이 없으면 기존 공통 오류 봉투의 `GROUP_NOT_FOUND`와 HTTP 404를 반환한다.
