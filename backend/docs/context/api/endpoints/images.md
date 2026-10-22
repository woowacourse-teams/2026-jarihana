# 이미지

### `POST /api/image-uploads`

- 설명: 이미지 업로드 리소스 생성
- 권한: `MEMBER`
- 인증 쿠키와 이 POST 요청의 CSRF 요구 사항은 [API 공통 계약](../common-contract.md)을 따른다.

#### 요청

```json
{
  "fileName": "group.webp",
  "contentType": "image/webp",
  "fileSize": 1048576
}
```

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `fileName` | String | 필수, 공백 불가. 파일명 확장자로 업로드 형식을 결정하지 않는다. |
| `contentType` | String | 필수, 공백 불가. 기본 허용 값은 `image/jpeg`, `image/png`, `image/webp`이며 서버 설정의 허용 목록에도 포함되어야 한다. |
| `fileSize` | Long | 필수, 양수. 선언한 크기를 바이트 단위로 검증하며 기본 최대값은 5,242,880바이트(5 MiB)다. |

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "imageKey": "groups/tmp/550e8400-e29b-41d4-a716-446655440000.webp",
    "uploadUrl": "https://storage.example.com/presigned-upload",
    "publicImageUrl": "https://jarihana.com/api/images/groups/tmp/550e8400-e29b-41d4-a716-446655440000.webp",
    "expiresAt": "2026-08-13T12:30:00"
  },
  "error": null
}
```

```plain text
Location: /api/image-uploads/550e8400-e29b-41d4-a716-446655440000
```

- `id`는 UUID 문자열이며, `expiresAt`은 업로드 기록과 URL의 만료 시각이다. 기본 유효 기간은 30분이다.
- `imageKey`는 `groups/tmp/{UUID}.{확장자}`다. 확장자는 `contentType`에 따라 `jpg`, `png`, `webp`로 정한다.
- 클라이언트는 Presigned URL에 `PUT`으로 이미지 바이트를 업로드하고, 발급 요청과 같은 `Content-Type`을 전달한다. API 호출 자체는 이미지 바이트를 받지 않는다.
- `publicImageUrl`은 설정된 공개 기본 URL과 `imageKey`를 연결한다. 기본 URL이 없으면 `/api/images/{imageKey}`를 반환한다.
- 업로드가 끝나면 `publicImageUrl`을 프리뷰와 마크다운 이미지 주소로 사용한다. 임시 이미지 프리뷰는 업로더의 로그인 쿠키가 있는 경우에만 업로드 만료 시각까지 허용한다.
- 그룹 생성·수정 API에는 URL이 아니라 `representativeImageKey`를 전달한다.
- 그룹 생성 또는 대표 이미지 키 변경 시 본인 업로드의 연결 자격과 실제 스토리지 객체의 크기·콘텐츠 타입을 확인한다. 임시 업로드는 만료 전이어야 한다. 기본 이미지나 `null`은 업로드 검증 대상이 아니며, 기존 참조 키를 유지하는 수정에서는 만료 여부를 다시 검증하지 않는다.
- 사진 활동 기록 작성·이미지 교체에도 `imageKey`를 사용하며, 상세 검증은 [사진 활동 기록](activity-posts.md)을 따른다.
- 모임 소개 본문에 포함된 관리 대상 이미지 키는 서버가 추출해 연결 자격을 확인하고 참조로 기록한다. 저장 시 승격된 키로 바꾸고, 조회 시 서비스 이미지 주소로 보정한다.

#### 생명주기
- 업로드 발급 API는 업로더 ID와 선언한 크기·콘텐츠 타입을 ImageUpload 기록에 저장한다. 별도 확정 API 대신 그룹·활동 기록 저장 안에서 연결 상태를 전환한다.
- 새 업로드는 `groups/tmp/{uuid}`에 저장하고, 그룹에 연결될 때 대표·소개·활동 사진 모두
  `groups/{groupId}/{uuid}`로 이동한다.
- 기존에 연결된 이미지는 경로를 일괄 변경하지 않는다.
- 새 업로드 하나는 한 그룹에만 연결할 수 있다.
- 같은 그룹에 이미 연결된 본인 업로드는 최초 업로드 만료 시각이 지나도 연결 자격이 있다. 기존 참조를 그대로 유지할 때는 업로더·만료·스토리지 검증을 다시 하지 않는다. 업로더 정보가 없는 기존 이미지에는 호환 처리가 적용된다.
- 종료된 그룹은 대표·소개·활동 사진 참조를 유지한다.
- 숨김 활동 기록·삭제된 그룹·교체된 이미지의 마지막 활성 참조가 사라지면 삭제를 예약한다. 만료된 미연결 업로드도 정리 작업에서 예약하며, 기본 유예 기간은 예약 시점부터 7일이다. 실제 객체·업로드 기록 삭제는 정리 작업 활성화와 실행 성공을 전제로 한다.
- 정리 작업은 배포 직후 기본 비활성화하며, 백필과 IAM 권한을 확인한 뒤 별도로 활성화한다.
- Presigned URL은 제한된 키와 유효 기간에 대한 업로드 권한을 제공하며 장기 자격 증명 비밀값을 응답 본문에 담지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| CSRF 토큰 없음·불일치 | `ACCESS_DENIED` | 403 |
| 인증 정보 없음·유효하지 않은 Access Token | `UNAUTHENTICATED` | 401 |
| 인증된 회원 ID에 해당하는 회원 없음 | `MEMBER_NOT_FOUND` | 404 |
| 필수 값 없음·공백, 파일 크기 0 이하 또는 잘못된 요청 형식 | `INVALID_PARAMETER` | 400 |
| 허용하지 않는 콘텐츠 타입 | `IMAGE_CONTENT_TYPE_NOT_ALLOWED` | 400 |
| 파일 크기 제한 초과 | `IMAGE_FILE_TOO_LARGE` | 400 |
| 스토리지 URL 발급 실패 | `IMAGE_UPLOAD_URL_ISSUE_FAILED` | 502 |

### `GET /api/images/{imageKey}`

- 설명: 안정적인 서비스 도메인 이미지 주소를 짧게 유효한 CDN 전달 URL로 교환
- 권한: 연결된 이미지 `PUBLIC`, 임시 이미지 `UPLOADER`
- 응답: 접근 가능하면 `302 Found`; CDN 서명 키 ID와 개인 키가 모두 설정되어 있으면 `Location`에 CloudFront 서명 URL을 반환한다. 유효 기간은 설정값을 사용하며 기본 5분이다. 임시 프리뷰는 업로드 만료 시각을 넘기지 않는다.
- 두 서명 설정 중 하나라도 비어 있으면 현재 구현은 서명하지 않은 전달 URL을 그대로 반환한다. 이 경우 서버가 URL의 만료를 보장하지 않는다.
- 연결된 이미지는 비로그인 사용자도 조회할 수 있다.
- 임시 이미지는 업로더만 업로드 만료 시각까지 조회할 수 있다.
- 활성 참조가 없고 임시 업로드 프리뷰 자격도 없는 이미지는 새 전달 URL을 받을 수 없다. 이미 발급된 서명 URL은 기본 최대 5분 뒤 만료되며 즉시 회수하지 않는다.
- 응답은 `Cache-Control: private, no-store`를 사용해 접근 판정 결과를 공유 캐시에 남기지 않는다.

브라우저에 노출되는 두 URL은 모두 환경별 기존 서비스 도메인을 사용한다. 접근 판정 주소는
`/api/images/groups/...`, 실제 S3 이미지 전달 주소는 `/images/groups/...`이며 CloudFront의 서로 다른
동작으로 라우팅한다. CloudFront 배포 도메인은 API 응답에 직접 사용하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 관리 대상이 아닌 키·이미지 없음, 활성 참조와 임시 프리뷰 자격이 모두 없음, 전달 경로 미설정 | `IMAGE_NOT_FOUND` | 400 |

이 GET 요청에는 CSRF 검증을 적용하지 않는다. 임시 이미지에 로그인 정보 없이 접근해도 `401` 대신 `IMAGE_NOT_FOUND` (`400`)로 응답한다. 설정된 개인 키의 파싱·서명 실패 등 처리되지 않은 서버 오류는 공통 `INTERNAL_ERROR` (`500`)로 응답한다.
