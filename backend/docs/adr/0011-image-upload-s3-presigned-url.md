# ADR 0011. 이미지 업로드를 S3 Presigned URL로 처리한다

- 상태: 채택
- 날짜: 2026-08-27
- 관련 문서: [ADR 0008](0008-aws-deployment-topology.md), [ADR 0012](0012-database-schema-management.md),
  [ADR 0006](0006-api-prefix-backend-context-path.md),
  [보안과 개인정보](../conventions/security.md), [API 엔드포인트 설계](../context/api/endpoints.md)
- 이 문서는 2026-08-26에 병합된 이미지 업로드 구현의 결정을 사후에 기록한다.
- 개정: 2026-08-27. 최초 작성본을 백엔드와 프론트엔드 구현에 대조했다. 결정 1부터 7까지는
  구현과 일치했고, 기록되지 않은 파급 세 가지(조회와 쓰기의 표현 불일치, 키 컬럼이 담는 값의
  종류, 실제 S3를 거치지 않는 테스트)를 제약과 결과에 추가한다.

## 배경

모임 대표 이미지를 사용자가 직접 올릴 수 있어야 했다. 그전까지 대표 이미지는
`images/default-group.png` 한 장의 플레이스홀더뿐이었고, [ADR 0006](0006-api-prefix-backend-context-path.md)의
후속 작업에도 그 파일의 자리를 정하는 항목만 남아 있었다.

업로드를 붙이려면 파일을 **어디에 두고 누가 그 바이트를 받을지**부터 정해야 했다. 이 프로젝트에는
그 선택을 좁히는 제약이 세 가지 있었다.

- 저장소는 우아한테크코스가 제공한 공유 버킷 `techcourse-project-2026`이다. 팀 전용 버킷을 만들
  권한이 없고, 다른 팀과 같은 버킷을 쓴다.
- 백엔드는 단일 EC2 위의 컨테이너 하나다([ADR 0008](0008-aws-deployment-topology.md)). 컨테이너
  파일 시스템은 배포마다 사라지고, 볼륨을 붙여도 그 EC2 한 대에 묶인다.
- AWS Access Key를 저장소나 GitHub 시크릿에 두고 싶지 않았다. 키가 늘어나면 유출 경로와 교체
  절차가 함께 늘어난다.

## 결정

이미지 업로드를 두 단계로 나누고, 바이트는 백엔드를 지나지 않게 한다.

1) `POST /api/image-uploads` - 백엔드가 presigned PUT URL과 imageKey를 발급
2) `PUT  <uploadUrl>` -  브라우저가 S3로 직접 업로드 (백엔드 경유 없음)
3) `POST/PUT /api/groups` - imageKey를 representativeImageKey로 전달

<br/>

1. `POST /api/image-uploads`는 presigned PUT URL과 `imageKey`를 발급한다. 이미지 바이트는
   백엔드를 통과하지 않는다.
2. AWS 자격 증명은 EC2 IAM Role과 SDK 기본 자격 증명 체인으로 얻는다. Access Key를 설정값이나
   저장소 시크릿으로 주입하지 않는다.
3. 객체는 공유 버킷 `techcourse-project-2026`의 `jarihana/images` prefix 아래에만 쓴다.
   `jarihana.image.key-prefix`가 그 경계를 담당하고, S3에 나가는 키는 항상 이 prefix가 앞에 붙는다.
4. 조회는 S3 직접 접근이 아니라 CloudFront 공개 URL(`jarihana.image.public-base-url`)로 한다.
   ADR 0008이 정한 단일 진입점을 이미지에도 그대로 적용한다.
5. URL을 발급하는 시점에 `image_upload` 행을 남긴다. presigned URL 유효 기간은 10분이고, 같은
   값이 그 행의 `expires_at`이 된다.
6. 그룹이 `representativeImageKey`를 받을 때 백엔드가 두 가지를 다시 확인한다. `image_upload`
   행이 존재하고 만료되지 않았는지, 그리고 S3에 객체가 실제로 있는지(`HeadObject`)를 확인한다.
   둘 중 하나라도 아니면 `IMAGE_NOT_FOUND`로 거절한다.
7. 허용 형식은 `image/jpeg`, `image/png`, `image/webp`이고 상한은 5MB다.

## 왜 이 방법인가

**업로드 트래픽과 API 처리를 분리한다.** 백엔드는 단일 EC2의 컨테이너 하나다. 이미지 바이트가
백엔드를 지나가면 업로드 대역폭과 힙을 API 처리와 같은 프로세스가 나눠 쓰게 된다. 이 구조에서
가장 먼저 나빠지는 것은 이미지와 무관한 요청의 응답 시간이다.

**저장 위치를 배포 주기에서 떼어 놓는다.** 컨테이너를 다시 만들어도 이미지가 남아야 한다. EC2
로컬 디스크나 Docker 볼륨은 그 EC2 한 대에 묶이고, ADR 0008이 감수한 단일 EC2 위험을 이미지
데이터까지 확대한다.

**자격 증명을 저장소 밖에 둔다.** IAM Role은 EC2 인스턴스에 붙어 있고 저장소에도 GitHub
시크릿에도 키 문자열이 없다. 유출 지점이 하나 줄고 교체 절차도 AWS 쪽 한 곳으로 모인다.

**presigned 방식의 약점을 저장 시점에 메운다.** 브라우저가 S3로 직접 올리므로 백엔드는 업로드
성공 여부를 통보받지 못한다. 그래서 그룹이 그 키를 실제로 쓰는 순간에 `HeadObject`로 객체 존재를
확인한다. 업로드에 실패했거나 남이 추측한 키를 보내면 그 지점에서 걸린다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| A. 백엔드가 multipart로 받아 S3에 올린다 | 서버가 실제 바이트를 보므로 파일 크기와 형식을 확실하게 검증한다. 업로드 성공을 서버가 안다 | 단일 EC2 컨테이너 하나가 업로드 대역폭까지 감당한다. 5MB 파일이 힙과 임시 디스크를 거쳐 다시 S3로 나가므로 같은 트래픽을 두 번 옮긴다 |
| B. EC2 로컬 디스크나 Docker 볼륨에 저장한다 | AWS 연동이 필요 없다. 로컬 개발이 단순하다 | 데이터가 EC2 한 대에 묶인다. ADR 0008이 감수한 단일 EC2 위험을 이미지까지 확대한다. 정적 파일 제공을 위해 백엔드가 웹 서버 역할을 겸해야 하고, context-path 때문에 그 경로도 `/api` 아래로 들어간다([ADR 0006](0006-api-prefix-backend-context-path.md)) |
| C. presigned POST policy를 쓴다 | 정책에 `content-length-range`를 넣어 **S3가** 파일 크기를 강제한다 | AWS SDK for Java v2에 presigned POST 지원이 없다. 폼 필드를 직접 서명해 만들어야 하고, 프론트엔드도 PUT 대신 multipart 폼 전송으로 바꿔야 한다 |
| D. 플레이스홀더 한 장을 유지한다 | 아무 비용이 없다 | 모임을 구분할 수단이 이름뿐이다. 대표 이미지는 MVP 화면 설계의 전제였다 |

C는 기각이 아니라 **보류**에 가깝다. 파일 크기를 서버가 실측하지 못하는 문제(아래 제약 참조)가
실제로 문제가 되면 가장 먼저 다시 볼 대안이다.

## 제약과 전제

- **공유 버킷이다.** `jarihana/images` 밖은 우리 영역이 아니다. IAM Role 권한도
  `arn:aws:s3:::techcourse-project-2026/jarihana/images/*`로 좁혀져 있다. prefix를 우회하는 키를
  만들면 권한 오류가 나거나 남의 영역을 건드린다.
- **CloudFront 설정이 저장소 밖에서 두 값을 이어 준다.** S3 객체 키는
  `jarihana/images/groups/tmp/<uuid>.<확장자>`인데 공개 URL은
  `<public-base-url>/groups/tmp/<uuid>.<확장자>`다. 두 경로가 맞아떨어지는 이유는 CloudFront
  배포가 `/images/*`를 그 prefix로 매핑하고 있기 때문이고, 그 설정은 저장소에 없다. 한쪽만
  바꾸면 조회가 조용히 404가 된다.
- **조회는 URL을 주고 쓰기는 키를 받는다. 그 간격을 프론트엔드가 문자열 파싱으로 메운다.**
  그룹 조회 응답 필드는 `representativeImageUrl`(공개 URL)인데 생성과 수정 요청 필드는
  `representativeImageKey`(스토리지 키)다. 그룹 수정이 전체 교체(PUT)라 기존 이미지를 그대로
  두려면 클라이언트가 키를 다시 실어 보내야 하는데, 클라이언트가 가진 값은 URL뿐이다. 그래서
  프론트엔드가 URL에서 키를 역산한다.

  ```js
  // frontend/src/features/image-upload/api.js
  const imagesIndex = path.indexOf("images/");
  const candidate = imagesIndex >= 0 ? path.slice(imagesIndex + "images/".length) : path;
  ```

  이 역산은 공개 URL에 `images/`가 들어 있고 키가 `groups/`로 시작한다는 두 가지에 기댄다.
  위 항목의 CloudFront 매핑이나 `key-prefix`가 바뀌면 함께 깨지는데, 깨져도 예외가 아니라
  `null`이 나오므로 대표 이미지가 조용히 사라지는 형태로 드러난다. 결합 지점이 저장소 밖
  CloudFront 설정, 백엔드 `key-prefix`, 프론트엔드 파싱까지 세 곳이라는 뜻이다. 프론트엔드
  코드의 주석도 이를 임시 변환으로 표시하고 응답 필드 추가를 대안으로 남겨 두었다.
- **`representative_image_key` 컬럼이 세 종류 값을 담는다.** 실제 S3 키(`groups/tmp/...`),
  기본 이미지 자리표시자(`images/default-group.png`), 그리고 `null`이다. 가운데 값은 S3 객체가
  아니라 프론트엔드 정적 파일 경로이므로 이 ADR의 결정 3이 말하는 prefix 규칙 밖에 있다.
  조회 시 `toRepresentativeImageUrl`이 그 값만 특수 분기로 그대로 돌려준다. 또한 그룹 생성은
  `null`을 자리표시자로 치환해 저장하고 그룹 수정은 `null`을 그대로 저장하므로, 화면에는 같게
  보이는 상태가 DB에 두 가지 모양으로 남는다.
- **서버가 파일 크기를 실측하지 않는다.** 5MB 검증은 클라이언트가 요청 본문에 적어 보낸
  `fileSize` 값으로만 한다. presigned PUT URL은 버킷, 키와 `Content-Type`을 서명에 묶지만 본문
  길이는 묶지 않는다. 작은 값을 신고하고 큰 파일을 올리는 것을 지금 구조에서는 막지 못한다.
- **로컬 개발이 실제 S3에 의존한다.** `application-local.yaml`에 이미지 설정 오버라이드가 없어
  로컬도 같은 버킷과 AWS 자격 증명을 요구한다. 자격 증명이 없는 팀원은 이미지 업로드 경로를
  로컬에서 실행할 수 없다.
- **IAM Role과 CloudFront 동작은 수동 관리한다.** ADR 0008과 같은 전제다.
- **자동화 테스트는 실제 S3를 거치지 않는다.** 테스트는 `ImageStorageStub`으로 `ImageStorage`를
  갈아끼우므로 presigned URL 서명과 `HeadObject` 호출은 한 번도 실행되지 않는다. 결정 1과
  결정 6이 의존하는 AWS 쪽 동작은 배포 후에야 확인된다.
- **`image_upload` 테이블을 배포 전에 사람이 만들어야 했다.** 운영 프로필이 `ddl-auto: validate`
  이고 마이그레이션 도구가 없기 때문이다. 이 문제는 [ADR 0012](0012-database-schema-management.md)에서 따로 다룬다.

## 결과

### 긍정적인 결과

- 이미지 바이트가 백엔드를 지나지 않으므로 업로드가 API 응답 시간에 영향을 주지 않는다.
- 컨테이너를 재배포해도 이미지가 남는다.
- 저장소와 GitHub 시크릿에 AWS Access Key가 없다.
- 조회 경로가 ADR 0008의 단일 진입점 안에 있어 별도 오리진이나 CORS 구성이 필요 없다.
- 남이 키를 추측해 그룹에 붙이려 해도 `image_upload` 행과 S3 객체를 함께 확인하므로 통과하지 못한다.

### 감수하는 비용

- **고아 객체가 쌓인다.** 업로드만 하고 그룹에 연결하지 않은 이미지를 정리하는 코드가 없다. S3
  객체와 `image_upload` 행이 모두 영구히 남는다. 공유 버킷이라 그 비용이 우리 팀 안에서 끝나지
  않는다.
- **모든 이미지가 `groups/tmp/` 경로에 영구히 있다.** 키 이름은 임시 자리를 뜻하는데 그룹에
  연결된 뒤 옮기는 단계가 없다. 이름과 실제가 어긋난 채로 남는다.
- **파일 크기 상한이 신고값 기준이다.** 위 제약 참조.
- **대표 이미지를 유지하려면 클라이언트가 URL을 키로 되돌려야 한다.** 조회와 쓰기가 서로 다른
  표현을 쓰는 대가이고, 그 변환이 프론트엔드 문자열 파싱에 놓여 있다. 위 제약 참조.
- **결정 1과 결정 6의 AWS 쪽 동작을 테스트가 잡지 못한다.** 위 제약 참조.
- **AWS 자격 증명이 없으면 로컬에서 이 기능을 못 돌린다.** [ADR 0005](0005-remove-local-development-auth-bypass.md)가
  "로컬에서 안 된다"를 근거로 우회로를 만들지 말라고 정했는데, 그 판단이 필요한 지점이 하나 새로
  생겼다. 지금은 우회로를 만들지 않고 제약으로 남겨 둔다.

## 후속 작업

- 고아 객체 정리 방식을 정한다. 만료된 `image_upload` 행과 그에 대응하는 S3 객체를 지우는
  배치, S3 수명 주기 규칙, 또는 둘의 조합을 비교한다. 공유 버킷이므로 수명 주기 규칙을 우리 팀
  prefix에만 걸 수 있는지 먼저 확인한다.
- 그룹에 연결된 이미지를 `groups/tmp/` 밖으로 옮길지, 아니면 키 이름에서 `tmp`를 빼고 임시라는
  의미를 지울지 정한다.
- 파일 크기를 실제로 강제해야 한다고 판단되면 대안 C(presigned POST policy의
  `content-length-range`)를 다시 검토한다.
- 로컬 개발에서 이미지 업로드를 실행할 방법을 정한다. 자격 증명 발급, 로컬 전용
  `ImageStorage` 구현, 또는 이 경로를 로컬 검증 범위 밖에 두는 것 중에서 고른다. ADR 0005의
  기준에 따라 "로컬에서 정말 안 되는지"를 먼저 측정한다.
- CloudFront의 `/images/*` 매핑과 `jarihana.image.key-prefix`가 같은 사실을 가리킨다는 점을
  인프라 문서에 적는다.
- 그룹 조회 응답에 `representativeImageKey`를 함께 내려 프론트엔드의 URL 역산을 없앨지 정한다.
  API 계약 변경이라 팀 확인이 필요하다. 그때까지는 CloudFront 경로나 `key-prefix`를 바꾸는
  작업에 프론트엔드 파싱 수정이 함께 따라온다는 사실을 변경 절차에 적어 둔다.
- `representative_image_key`가 담는 값을 한 종류로 좁힐지 정한다. 기본 이미지를 컬럼에 넣지 않고
  `null`로 통일한 뒤 조회 시점에만 기본 URL을 채우는 방향이 후보다. 그룹 생성과 수정의 `null`
  처리 차이도 이때 함께 없앤다.
- 실제 S3를 거치는 검증 수단을 정한다. LocalStack이나 Testcontainers로 통합 테스트를 두는 방법과,
  배포 후 수동 점검 절차를 문서로 남기는 방법을 비교한다.
