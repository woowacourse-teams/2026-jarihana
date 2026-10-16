# 그룹 공유 미리보기

### `GET /api/share/groups/{groupId}`

- 설명: 그룹별 소셜 공유 미리보기에 필요한 HTML 메타데이터 반환
- 권한: `PUBLIC`
- 성공: `200 OK`, `Content-Type: text/html`, `Cache-Control: max-age=300, public`
- 성공 본문은 HTML 문자열이며 JSON 응답 봉투를 사용하지 않는다. 별도 Query Parameter는 바인딩하지 않는다.

응답의 `<head>`에는 `og:title`, `og:description`, `og:url`, `og:image`와
`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`를 포함한다.
`og:url`은 프론트엔드의 `/groups/{groupId}` canonical URL이다. 브라우저에서만 실행되는
스크립트가 원래 주소의 유효한 `promotion_id` 하나만 보존해
`/groups/{groupId}?preview=1&promotion_id=...`로 이동하며, JavaScript를 실행하지 않는
크롤러는 첫 HTML의 메타데이터를 그대로 읽는다. canonical과 OG URL에는 쿼리를 포함하지
않는다.

제목은 `{그룹명} | 자리하나`, 설명은 그룹의 한 줄 소개(`introduction`)다. 대표 이미지는
절대 URL로 반환하며 기본 이미지에는 `{frontendOrigin}/assets/default-group.png`를 사용한다.
그룹 메타데이터의 HTML 특수문자는 이스케이프한다. `promotion_id`는 한 개만 있고
`^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`에 맞는 1–80자 값일 때만 브라우저 이동 주소에 보존한다.

CloudFront viewer-request 함수가 일반 `/groups/{groupId}` 요청을 이 엔드포인트로
연결한다. `preview=1`인 요청은 SPA로 연결하여 반복 이동을 막고, 미리보기 원본 요청에서는
쿼리를 제거한다([CloudFront 설정](../../../../../infra/cloudfront/README.md)).
`/api/share/groups/{groupId}`를 직접 호출해도 같은 HTML을 반환한다.

그룹이 없으면 기존 공통 오류 봉투의 `GROUP_NOT_FOUND`와 HTTP 404를 반환한다.
숫자로 변환할 수 없는 `groupId`는 `INVALID_PARAMETER`와 HTTP 400을 반환한다.
