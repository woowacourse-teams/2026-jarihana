# CloudFront 그룹 공유 미리보기

`group-share-preview.js`는 `/groups/{groupId}` 요청을 백엔드의
`/api/share/groups/{groupId}`로 연결하는 CloudFront viewer-request 함수다.
백엔드 응답에는 그룹 이름·소개·대표 이미지의 Open Graph와 Twitter 메타태그가
포함되어 있어 카카오톡, Slack, Facebook 같은 크롤러가 React 실행 없이 미리보기를
만들 수 있다.

CloudFront에서 다음을 한 번 설정한다.

1. `Functions`에서 함수를 만들고 코드를 붙여 넣는다. Runtime은 **2.0**을 선택한다.
2. 개발(Development) 상태에서 저장한 뒤 **Publish**한다.
3. 배포판 `E1YDHL1SDC4C1C`의 기본 캐시 동작(Default `*`)에 Viewer request 단계로 연결한다.
4. 코드의 `BACKEND_ORIGIN_ID`가 Origins 탭의 백엔드 Origin name인
   `jarihana-backend`인지 확인한다. 이 함수는 URI만 바꾸는 대신 해당 origin도 명시적으로
   선택한다. CloudFront에서 URI만 바꾸면 기본 S3 origin이 그대로 선택되기 때문이다.
5. 백엔드의 `/api/share/groups/{groupId}`가 운영에 먼저 배포되어 공개 GET 요청에서 HTML을
   반환하는지 확인한다. 그 뒤 배포판이 완료되면 `/groups/*` 캐시 무효화를 한 번 실행한다.
6. `?preview=1` 쿼리를 포함한 요청은 캐시 정책에서 원본 경로와 충돌하지 않도록 확인한다.

함수는 그룹 메타데이터와 SPA 요청 모두에서 원본으로 전달하는 쿼리를 비운다. 브라우저에
남아 있는 원래 주소와 SPA의 JavaScript가 `promotion_id`를 하나만 읽고, 허용된 형식일 때만
`?preview=1&promotion_id=...`으로 SPA를 연다. 따라서 임의의 쿼리나 개인정보가 백엔드·PostHog로
전달되지 않으며, 프로모션마다 메타데이터 HTML 캐시를 나눌 필요도 없다. 함수가 쿼리를 원본으로
전달하도록 바뀌는 경우에는 `/groups/*` 동작의 캐시 키가 `promotion_id`를 포함하거나 해당
메타데이터 응답을 캐시하지 않도록 별도 정책을 적용해야 한다.

일반 사용자가 `/groups/13`을 열면 메타 페이지의 브라우저 전용 스크립트가 `?preview=1`로
이동시키고, 이 쿼리가 붙은 요청은 rewrite를 건너뛰어 기존 S3의 React 앱을 표시한다.
공유 크롤러는 첫 HTML의 메타태그를 읽으므로 그룹별 미리보기를 얻는다.

## 개발 SPA 경로 fallback

`spa-fallback.js`는 개발 프론트엔드에서 `/oauth/callback` 같은 React Router 경로를
직접 열거나 새로고침할 때 S3 대신 React 앱 셸을 응답하도록 한다. 확장자 없는 경로를
원본 요청 전에 `/index.html`로 바꾸며, 브라우저 주소와 쿼리 문자열은 바꾸지 않는다.
CloudFront는 URI를 바꿔도 이미 선택한 캐시 동작과 원본을 유지한다.

개발 배포판 `E33XV6JTG8NPYF`에 다음과 같이 설정한다.

1. `Functions`에서 `spa-fallback.js` 코드로 CloudFront Function을 만들고 Runtime 2.0을 선택한다.
2. 테스트한 뒤 함수를 **Publish**해 `LIVE` 상태로 만든다.
3. 개발 배포판의 기본 캐시 동작 `Default (*)`에서 `Function associations`의 **Viewer request**에 연결한다.
4. `/api/*` 동작에는 함수를 연결하지 않는다. 이 경로는 백엔드 원본 동작에 남아야 한다.
5. 배포 상태가 `Deployed`가 된 뒤 `/oauth/callback?signupRequired=true`와 정적 파일을 확인한다.

SPA 경로를 처리할 때 배포판 전체의 사용자 지정 `403`/`404` 응답을 `/index.html`로 바꾸지
않는다. 그런 설정은 백엔드 `/api/*` 응답 코드까지 바꿀 수 있다. 함수 방식에서는 프론트엔드
경로만 React 앱으로 보내며, API의 `400`/`404` 응답은 API 동작을 통해 그대로 전달한다.

## 웹푸시 경로

SW·manifest·아이콘·알림 클릭 경로의 응답과 캐시 설정은
[웹푸시 운영 가이드](../../backend/docs/operations/web-push.md#sw와-cdn-경로)에서 관리한다.
