# 공유 미리보기

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

CloudFront viewer-request 함수는 `/groups/{groupId}`에 온 등록된 공유 봇의 GET 요청을
이 엔드포인트로 보낸다. 일반 브라우저는 S3의 React 앱을 바로 받는다.
`/api/share/groups/{groupId}`를 직접 호출해도 같은 HTML을 반환한다.

그룹이 없으면 기존 공통 오류 봉투의 `GROUP_NOT_FOUND`와 HTTP 404를 반환한다.

### `GET /api/share/sparrings/{topicId}`

- 설명: 토론별 소셜 공유 미리보기에 필요한 HTML 메타데이터 반환
- 권한: `PUBLIC` (마감된 토론도 조회 가능)
- 응답 형식: `text/html`
- 캐시: `Cache-Control: max-age=300, public`

그룹 미리보기와 같은 OG/Twitter 메타태그를 사용한다.

| 항목 | 내용 |
| --- | --- |
| 제목 | `{토론명} \| 토론해요 · 자리하나` |
| 설명 | `{민트 편명} vs {코랄 편명}` |
| 사진 | 토론 대표사진의 절대 URL. 사진이 없으면 프론트의 `/sparring-arena/assets/entry-rivals.webp` |
| canonical·OG URL | `{frontendOrigin}/sparring/{topicId}` (쿼리 없음) |

우세·투표수·비율·의견수·현재 상태는 공유 카드에 포함하지 않는다. 공유용 조회도
제목·편명·대표사진 키만 가져오며 표수나 의견수를 집계하지 않는다.
사진 URL은 만료되는 CDN 서명 URL을 HTML에 고정하지 않고 기존 이미지 접근 API의 안정된 주소를 사용한다.

CloudFront 함수는 `/sparring/{topicId}`에 온 등록된 공유 봇의 GET 요청을 이 엔드포인트로
보내고 일반 브라우저에는 React 앱을 바로 제공한다. 브라우저가 API를 직접 열거나 로컬 개발
서버에서 공유 HTML을 열면 공용 스크립트가 `?preview=1`을 붙여 React 화면으로 이동한다.

토론이 없으면 공통 JSON 오류 봉투의 `SPARRING_NOT_FOUND`와 HTTP 404를 반환한다.
서버의 5분 캐시와 별개로 공유 서비스가 메타데이터·이미지를 캐시할 수 있으므로,
이미 공유한 카드의 자동 갱신이나 즉시 변경 반영을 보장하지 않는다.
