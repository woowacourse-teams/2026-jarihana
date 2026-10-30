# 이미지

### `POST /api/image-uploads`

- 설명: 이미지 업로드 리소스 생성
- 권한: `MEMBER`

#### 요청

```json
{
  "fileName": "group.webp",
  "contentType": "image/webp",
  "fileSize": 1048576
}
```

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

- 클라이언트는 30분 동안 해당 객체 키에만 유효한 Presigned URL로 스토리지에 이미지 바이트를 직접 업로드한다.
- 업로드가 끝나면 `publicImageUrl`을 프리뷰와 마크다운 이미지 주소로 사용한다. 임시 이미지 프리뷰는
  업로더의 로그인 쿠키가 있는 경우에만 업로드 만료 시각까지 허용한다.
- 그룹 생성·수정 API에는 URL이 아니라 `representativeImageKey`를 전달한다.
- 토론 생성 API도 같은 업로드 과정을 사용하고 선택 `representativeImageKey`를 받는다.
- 그룹 생성·수정 요청의 `representativeImageKey`는 아직 만료되지 않은 업로드 기록과 실제 스토리지 객체가 모두 존재해야 한다.
- 모임 소개 본문에 삽입한 이미지는 `publicImageUrl`이 마크다운에 저장되며, 서버는 본문의 이미지 키도
  참조로 기록한다.

#### 생명주기
- 새 업로드는 `groups/tmp/{uuid}`에 저장하고, 그룹에 연결될 때 대표·소개·활동 사진 모두
  `groups/{groupId}/{uuid}`로 이동한다.
- 기존에 연결된 이미지는 경로를 일괄 변경하지 않는다.
- 새 업로드 하나는 한 그룹에만 연결할 수 있다.
- 토론 대표사진은 그룹과 별개로 `sparrings/{topicId}/{uuid}`에 연결한다. 하나의 업로드를 그룹과
  토론 사이 또는 서로 다른 토론에서 공유할 수 없다. 토론 마감은 이미지 참조를 제거하지 않는다.
- 종료된 그룹은 대표·소개·활동 사진 참조를 유지한다.
- 숨김 활동기록, 삭제된 그룹, 만료된 미연결 업로드는 새 조회 URL을 발급하지 않고 7일 뒤 물리 삭제한다.
- 정리 작업은 배포 직후 기본 비활성화하며, 백필과 IAM 권한을 확인한 뒤 별도로 활성화한다.
- Presigned URL은 스토리지 키나 장기 자격 증명을 노출하지 않는다.

### `GET /api/images/{imageKey}`

- 설명: 안정적인 서비스 도메인 이미지 주소를 짧게 유효한 CDN 전달 URL로 교환
- 권한: 연결된 이미지 `PUBLIC`, 임시 이미지 `UPLOADER`
- 응답: 접근 가능하면 `302 Found`; `Location`은 최대 5분 동안 유효한 CloudFront 서명 URL이다.
- 연결된 이미지는 비로그인 사용자도 조회할 수 있다.
- 임시 이미지는 업로더만 업로드 만료 시각까지 조회할 수 있다.
- 숨김·미연결·삭제 대기 이미지는 새 전달 URL을 받을 수 없다. 이미 발급된 URL은 최대 5분 뒤 만료된다.
- 응답은 `Cache-Control: private, no-store`를 사용해 접근 판정 결과를 공유 캐시에 남기지 않는다.

브라우저에 노출되는 두 URL은 모두 환경별 기존 서비스 도메인을 사용한다. 접근 판정 주소는
`/api/images/groups/...`, 실제 S3 이미지 전달 주소는 `/images/groups/...`이며 CloudFront의 서로 다른
동작으로 라우팅한다. CloudFront 배포 도메인은 API 응답에 직접 사용하지 않는다.
토론 사진은 같은 규칙의 `/api/images/sparrings/...`와 `/images/sparrings/...`를 사용한다.
토론 이미지 기능 배포 전 스토리지 복사·조회·삭제와 CDN의 `sparrings/` 경로 허용을 확인한다.
V16은 nullable 토론 소유 컬럼과 참조 타입을 확장한다. 구버전 앱은 기존 그룹 입력을 계속 처리하지만
토론 사진의 새 키를 전달하지 못하므로 기능 활성화 후 구버전으로 롤백하면 토론 사진 조회가 제한된다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 허용하지 않는 콘텐츠 타입 | `IMAGE_CONTENT_TYPE_NOT_ALLOWED` | 400 |
| 파일 크기 제한 초과 | `IMAGE_FILE_TOO_LARGE` | 400 |
| 스토리지 URL 발급 실패 | `IMAGE_UPLOAD_URL_ISSUE_FAILED` | 502 |
| 이미지가 없거나 조회 권한·활성 참조가 없음 | `IMAGE_NOT_FOUND` | 400 |
