# CloudFront 경로 운영

## 비공개 그룹 이미지 전달

그룹 대표·소개·활동 사진은 기존 서비스 도메인에서 두 경로로 나눠 전달한다.

| 경로 | 원본 | 역할 |
| --- | --- | --- |
| `/api/images/groups/*` | 백엔드 EC2 | 참조·업로더·만료 시각을 확인하고 302 응답 |
| `/images/groups/*` | 이미지 S3 Origin | CloudFront 서명 URL이 있을 때만 이미지 바이트 전달 |

운영 환경의 예시는 다음과 같다. 개발 환경은 운영 도메인 대신 개발 서비스 도메인을 사용한다.

```text
IMAGE_S3_PUBLIC_BASE_URL=https://jarihana.com/api/images
IMAGE_CDN_DELIVERY_BASE_URL=https://jarihana.com/images
IMAGE_CLOUDFRONT_KEY_PAIR_ID=<trusted key group의 public key id>
IMAGE_CLOUDFRONT_PRIVATE_KEY=<PKCS#8 RSA private key PEM>
IMAGE_CLEANUP_ENABLED=false
```

CloudFront에서 다음을 설정한다.

1. 공개 키와 trusted key group을 만들고 애플리케이션이 대응하는 PKCS#8 개인 키를 GitHub Environment
   secret `IMAGE_CLOUDFRONT_PRIVATE_KEY`로 받게 한다. 개인 키를 저장소나 EC2 파일에 커밋하지 않는다.
2. `/images/groups/*` 캐시 동작을 이미지 S3 Origin에 연결하고 trusted key group을 요구한다.
   서명 없는 요청을 허용하지 않는다. 기본 이미지 `/images/default-group.png`는 이 동작에 포함하지 않는다.
3. 기존 `/api/*` 동작이 `/api/images/groups/*`를 백엔드에 전달하는지 확인한다. 이 응답은
   `Cache-Control: private, no-store`이며 CloudFront에서 캐시하지 않는다.
4. 이미지 S3 Origin이 실제 객체 prefix `jarihana/images`를 가리키는지 확인한다. 애플리케이션의
   `groups/...` 키가 최종 S3 키 `jarihana/images/groups/...`와 정확히 한 번만 결합되어야 한다.
5. 배포 도메인(`*.cloudfront.net`) 대신 환경별 기존 서비스 도메인으로 두 Base URL을 설정한다.
   백엔드가 반환하는 서명 URL의 호스트도 기존 서비스 도메인이어야 한다.
6. 새 경로에서 연결 이미지 조회, 업로더 임시 프리뷰, 비업로더 거부, 서명 만료를 확인한다. 기존의
   서명 없는 이미지 URL이 거부되는지도 확인한다.
7. DB 백필과 IAM Role의 `s3:GetObject`(HEAD·복사 원본), `s3:PutObject`(복사 대상),
   `s3:DeleteObject` 권한을 확인한 뒤에만 `IMAGE_CLEANUP_ENABLED=true`로 바꾼다. 최초 배포에서는
   `false`를 유지한다.

백엔드가 발급한 전달 URL은 최대 5분 동안만 유효하다. 활동기록을 숨기거나 이미지 참조를 해제하면 새 URL은
즉시 발급되지 않지만, 이미 발급된 URL은 남은 유효 시간 동안 접근될 수 있다.

## PWA 설치 안내 이미지

PWA 설치 안내 이미지는 사용자 업로드가 아닌 공개 정적 자산이다. 프론트엔드는 공개 S3 경로
`https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/jarihana-dev/images/push-guide/`의
브라우저별 하위 경로를 직접 사용한다. 서비스 도메인의 `/images/push-guide/*` 요청은 403을 반환해
가이드 이미지를 전달하지 못하므로 현재 프론트엔드에서는 사용하지 않는다.

향후 서비스 도메인으로 옮기려면 `/images/push-guide/*` 캐시 동작이 실제 안내 이미지의 S3 prefix를
가리키도록 연결하고, trusted key group 없이 공개 GET/HEAD가 가능한지 확인해야 한다. 사용자 업로드를
전달하는 `/images/groups/*`에는 계속 trusted key group을 요구하며 두 경로의 접근 정책을 합치지 않는다.

## 그룹 공유 미리보기

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
