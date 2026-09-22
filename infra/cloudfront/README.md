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
