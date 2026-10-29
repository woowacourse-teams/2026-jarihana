# 배포 관제 화면 계약

기준은 Grafana 13.2.3에서 편집·검증한 `jarihana-deployment`의 네이티브 V2 모델이다.
래스터 이미지나 HTML 패널이 아니라 Canvas 도형, 연결, metric field와 실제 PromQL로 구성한다.

## 원본과 생성물

- `source/dashboard.json`: 패널, Canvas geometry, 연결, 필드 매핑, 조건부 레이아웃.
- `source/colors.json`: 배경·카드·텍스트·정상·경고·실패·미확인 공통 색상.
- `source/queries.json`: DEV/PROD별 PromQL. 반복하는 단계 쿼리는 같은 키를 참조한다.
- `build-dashboard.mjs`: `@color/`와 `@query/` 참조를 해석하고 V2 resource JSON을 생성한다.
- 생성 파일은 `../provisioning/dashboards/json/jarihana-deployment.json`이며 직접 수정하지 않는다.

## 화면 구조

`environment` 단일 선택 드롭다운을 사용하고 저장 기본값은 PROD다. PROD와 DEV는
같은 드롭다운에 대한 조건부 RowsLayout이며, 미선택 환경은 보이지 않는다.
상단 네 요약 카드는 단계·요청 대상·관측 호스트·요청률 순서다.

Canvas artboard는 1480×860이다. 사용자·CloudFront·S3·앱·RDS 위치와 카드 스타일,
헤더·안내문·하단 여섯 단계의 위치를 공통으로 사용한다. DEV의 단일 앱은 PROD의
앱 열에서 A/B 사이 높이에 배치하며 Nginx와 두 번째 앱 노드를 만들지 않는다.

연결 anchor의 y 양수는 위쪽이다. CloudFront의 S3 경로는 위쪽, API 경로는 아래쪽으로
보내며 Nginx의 A 경로와 B 경로도 상하로 분리한다. PROD 실제 수신 경로만 초록색으로
강조하고 DEV 구성선은 회색으로 유지한다.

## 상태와 접근성

상태는 색과 텍스트를 함께 사용한다. 하단 단계에는 원형 기호와 단계명을 함께 표시한다.
강조는 실제 phase와 같은 단계에만 적용한다. 롤백·실패·취소·미확인은 별도 현재 단계
문구로 표시하며 완료를 추정하지 않는다. 호스트 이름은 매핑 또는 target label의 string
field를 사용하며 서버 이름이나 실행 상태를 다이어그램에 고정하지 않는다.

DEV는 Actions 150초 조회/360초 관측 유효 시간을 사용한다. PROD 수집기는 직전 수집 종료 후
30초에 다시 실행하고 수집기 관측값과 sample은 90초 미만일 때 유효하다. 30초 대기와 실행 시간,
한 차례의 수집 지연을 허용한다. 앱/DB sample 유효 시간은 기존 45초를 유지한다.
metric sample 자체의 중단도 별도로 검사한다. 화면 갱신은 5초다.

운영 데스크톱 Canvas를 기준으로 하며 축소 시 pan/zoom을 사용한다. 모바일 전용 배치와
테마별 palette는 이번 포트 범위에 포함하지 않는다. 작은 카드 문자열은 최소 20px,
일반 Canvas 문구는 주로 24px 이상인 원본 규격을 유지한다.
