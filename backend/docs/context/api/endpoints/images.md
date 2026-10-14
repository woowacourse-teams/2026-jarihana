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
    "publicImageUrl": "https://cdn.example.com/images/groups/tmp/550e8400-e29b-41d4-a716-446655440000.webp",
    "expiresAt": "2026-08-13T12:10:00"
  },
  "error": null
}
```

```plain text
Location: /api/image-uploads/550e8400-e29b-41d4-a716-446655440000
```

- `id`는 UUID 문자열이며, `expiresAt`은 업로드 기록과 URL의 만료 시각이다. 기본 유효 기간은 10분이다.
- `imageKey`는 `groups/tmp/{UUID}.{확장자}`다. 확장자는 `contentType`에 따라 `jpg`, `png`, `webp`로 정한다.
- 클라이언트는 Presigned URL에 `PUT`으로 이미지 바이트를 업로드하고, 발급 요청과 같은 `Content-Type`을 전달한다. API 호출 자체는 이미지 바이트를 받지 않는다.
- `publicImageUrl`은 설정된 공개 기본 URL과 `imageKey`를 연결한다. 기본 URL이 없으면 `/images/{imageKey}`를 반환한다.
- 업로드가 끝나면 `publicImageUrl`을 마크다운 이미지 주소로 사용한다.
- 그룹 생성·수정 API에는 URL이 아니라 `representativeImageKey`를 전달한다.
- 그룹 생성 또는 대표 이미지 키 변경 시 새 키의 만료되지 않은 업로드 기록과 실제 스토리지 객체를 확인한다. 기본 이미지나 `null`은 업로드 검증 대상이 아니며, 기존 키를 그대로 유지하는 수정에서는 만료 여부를 다시 검증하지 않는다.
- 사진 활동 기록 작성·이미지 교체에도 `imageKey`를 사용하며, 상세 검증은 [사진 활동 기록](activity-posts.md)을 따른다.

#### 생명주기
- 업로드 발급 API는 ImageUpload 기록을 저장한다. 그룹 대표 이미지, 소개 본문, 활동 기록에서 사용할 수 있지만 별도의 확정 상태 전환 API는 없다.
- 현재 코드에는 만료된 임시 객체와 ImageUpload 기록을 삭제하는 정리 작업이 없다. 만료는 새 이미지 연결 시 검증하며 이미 연결된 이미지를 자동 삭제하지 않는다.
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
