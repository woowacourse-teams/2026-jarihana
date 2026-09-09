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
    "expiresAt": "2026-08-13T12:10:00"
  },
  "error": null
}
```

- 클라이언트는 제한된 시간과 객체 키에만 유효한 Presigned URL로 스토리지에 이미지 바이트를 직접 업로드한다.
- 그룹 생성·수정 API에는 URL이 아니라 `representativeImageKey`를 전달한다.
- 그룹 생성·수정 요청의 `representativeImageKey`는 아직 만료되지 않은 업로드 기록과 실제 스토리지 객체가 모두 존재해야 한다.

#### 생명주기
- 그룹에 연결된 `representativeImageKey`만 대표 이미지로 확정한다.
- 만료 시점까지 그룹에 연결되지 않은 임시 객체와 ImageUpload 기록은 정리 작업으로 삭제한다.
- Presigned URL은 스토리지 키나 장기 자격 증명을 노출하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 허용하지 않는 콘텐츠 타입 | `IMAGE_CONTENT_TYPE_NOT_ALLOWED` | 400 |
| 파일 크기 제한 초과 | `IMAGE_FILE_TOO_LARGE` | 400 |
| 스토리지 URL 발급 실패 | `IMAGE_UPLOAD_URL_ISSUE_FAILED` | 502 |
