![자리하나? 우리만의 모임을 꾸미고, 함께 어울려요.](docs/screenshots/readme/jarihana.png)

# 자리하나?

## 서비스 소개

**자리하나?** 는 모임을 찾고 직접 만들며 우리 모임만의 3D 공간인 **아지트**를 꾸밀 수 있는 서비스입니다.

함께하고 싶은 사람을 초대해 아지트에서 만나 보세요. 멤버들과 다음 약속을 잡고 함께한 활동은 사진과 글로 남길 수 있습니다.

<a href="https://jarihana.com/"><img src="docs/readme/service-button.png" width="168" height="44" alt="서비스 바로가기" /></a>

## 주요 기능

| 기능                     | 할 수 있는 일                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 모임 탐색과 참여         | 이름, 유형, 모집 상태로 모임을 찾습니다. 일정과 남은 자리를 확인한 뒤 참여를 신청하고 마이페이지에서 결과를 확인합니다.                                                    |
| 모임 제안과 모집         | 자유게시판에 아이디어를 올려 함께하고 싶은 사람과 가능한 시간을 알아봅니다. 모임을 열 때는 바로 가입하거나 모임장이 승인하는 방식을 고르고 초대 링크를 공유할 수 있습니다. |
| 모임 꾸미기 (아지트)     | 스터디와 동아리의 모임장은 3D 모임방에 가구를 배치하고 벽과 바닥 테마를 바꿀 수 있습니다. 멤버들은 아바타로 방 안을 걸어 다니거나 의자에 앉을 수 있습니다.                 |
| 채팅과 일정              | 멤버 전용 채팅방에서 대화하고 모임 캘린더에서 정기 일정과 개별 약속을 확인합니다.                                                                                          |
| 활동 기록                | 모임 사진과 후기를 올리고 댓글과 하트로 반응을 주고받습니다.                                                                                                               |
| 토론과 게임              | '토론하나?'에서는 주제에 대한 입장을 고르고 상대의 한마디에 답합니다. '게임하나?'에서는 친구와 오목을 두거나 리듬 작살에 도전할 수 있습니다.                               |

!["보드게임 하자" 아지트에 들어가 게임 테이블 옆 빈 의자에 앉는 아바타](docs/screenshots/readme/clubhouse-walk-and-sit.gif)

## 프로젝트 아키텍처

![CloudFront 요청이 서울 리전 경계를 지나 S3, Nginx, 아지트 실시간 EC2로 나뉩니다. 브라우저는 S3로 직접 업로드(PUT)합니다. Nginx는 BLUE/GREEN 앱 간에 트래픽을 전환합니다. 앱과 아지트는 RDS를 사용하고 각 EC2의 Alloy는 모니터링 EC2로 메트릭과 로그를 보냅니다. Grafana는 Slack 웹훅으로 장애와 복구를 알립니다.](docs/readme/service-architecture.svg)

<details>
<summary>가용 영역과 서브넷 보기</summary>

![서울 리전 VPC에서 Nginx와 BLUE, GREEN 앱은 2b 퍼블릭 서브넷에 있고 RDS는 2b 프라이빗 서브넷에 있습니다. 아지트와 모니터링 EC2는 2a 퍼블릭 서브넷에 있습니다.](docs/readme/service-subnets.svg)

[diagrams.net 편집 원본](docs/readme/service-architecture.drawio)

</details>

### CI/CD

[![develop에 배포 대상 변경을 푸시하면 백엔드는 GHCR 이미지를 개발 EC2에서 실행하고 프론트엔드는 개발 설정으로 빌드해 S3 개발 경로에 게시합니다. 아지트 실시간 서버는 develop에서 Realtime Deploy가 이미지를 빌드해 GHCR에 게시한 뒤 개발과 운영이 함께 쓰는 컨테이너를 교체합니다. main에서는 변경 범위에 따라 백엔드와 프론트엔드를 배포합니다. 백엔드는 기존 GHCR 이미지를 main 커밋의 Compose로 기동한 뒤 Nginx 트래픽을 전환하고 프론트엔드는 운영 설정으로 빌드해 S3 운영 경로에 게시합니다.](docs/readme/delivery.svg)](docs/readme/delivery.drawio)

## 기술 스택

### 프론트엔드

| 구분 | 기술 |
| --- | --- |
| 언어와 UI | <img src="docs/readme/badges/javascript.svg" height="28" alt="JavaScript" /> <img src="docs/readme/badges/react.svg" height="28" alt="React" /> <img src="docs/readme/badges/tailwind-css.svg" height="28" alt="Tailwind CSS" /> |
| 라우팅 | <img src="docs/readme/badges/react-router.svg" height="28" alt="React Router" /> |
| 서버 상태 관리 | <img src="docs/readme/badges/tanstack-query.svg" height="28" alt="TanStack Query" /> |
| 폼과 입력 검증 | <img src="docs/readme/badges/react-hook-form.svg" height="28" alt="React Hook Form" /> <img src="docs/readme/badges/zod.svg" height="28" alt="Zod" /> |
| 실시간 통신 | <img src="docs/readme/badges/stomp-js.svg" height="28" alt="STOMP.js" /> |
| 3D 렌더링 | <img src="docs/readme/badges/three-js.svg" height="28" alt="Three.js" /> |
| 빌드 | <img src="docs/readme/badges/webpack.svg" height="28" alt="Webpack" /> |
| 테스트 | <img src="docs/readme/badges/jest.svg" height="28" alt="Jest" /> <img src="docs/readme/badges/testing-library.svg" height="28" alt="Testing Library" /> <img src="docs/readme/badges/playwright.svg" height="28" alt="Playwright" /> |

### 백엔드

| 구분 | 기술 |
| --- | --- |
| 언어와 프레임워크 | <img src="docs/readme/badges/java.svg" height="28" alt="Java" /> <img src="docs/readme/badges/spring-boot.svg" height="28" alt="Spring Boot" /> |
| 인증과 세션 | <img src="docs/readme/badges/spring-security.svg" height="28" alt="Spring Security" /> <img src="docs/readme/badges/spring-session-jdbc.svg" height="28" alt="Spring Session JDBC" /> |
| 실시간 통신 | <img src="docs/readme/badges/websocket-stomp.svg" height="28" alt="WebSocket (STOMP)" /> <img src="docs/readme/badges/sse.svg" height="28" alt="SSE" /> |
| 데이터 관리 | <img src="docs/readme/badges/spring-data-jpa.svg" height="28" alt="Spring Data JPA" /> <img src="docs/readme/badges/postgresql.svg" height="28" alt="PostgreSQL" /> <img src="docs/readme/badges/flyway.svg" height="28" alt="Flyway" /> |
| 테스트 | <img src="docs/readme/badges/junit-6.svg" height="28" alt="JUnit 6" /> <img src="docs/readme/badges/rest-assured.svg" height="28" alt="REST Assured" /> <img src="docs/readme/badges/testcontainers.svg" height="28" alt="Testcontainers" /> |

### 인프라

| 구분 | 기술 |
| --- | --- |
| AWS | <img src="docs/readme/aws-services.svg" height="28" alt="Amazon CloudFront, S3, EC2, RDS" /> <img src="docs/readme/badges/cloudfront-functions.svg" height="28" alt="CloudFront Functions" /> |
| 컨테이너와 웹 서버 | <img src="docs/readme/badges/docker.svg" height="28" alt="Docker" /> <img src="docs/readme/badges/nginx.svg" height="28" alt="Nginx" /> |
| CI/CD | <img src="docs/readme/badges/github-actions.svg" height="28" alt="GitHub Actions" /> <img src="docs/readme/badges/ghcr.svg" height="28" alt="GHCR" /> |
| 모니터링 | <img src="docs/readme/badges/grafana-alloy.svg" height="28" alt="Grafana Alloy" /> <img src="docs/readme/badges/prometheus.svg" height="28" alt="Prometheus" /> <img src="docs/readme/badges/loki.svg" height="28" alt="Loki" /> <img src="docs/readme/badges/grafana.svg" height="28" alt="Grafana" /> |
| 제품 분석 | <img src="docs/readme/badges/posthog.svg" height="28" alt="PostHog" /> |

## 팀원

|                                                                이삭                                                                |                                                                  요크                                                                  |                                                                 파도                                                                 |                                                                 에덴                                                                 |
| :--------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------: |
| <a href="https://github.com/5jonyuk"><img src="https://github.com/5jonyuk.png?size=160" width="88" alt="이삭 GitHub 프로필" /></a> | <a href="https://github.com/Sauter001"><img src="https://github.com/Sauter001.png?size=160" width="88" alt="요크 GitHub 프로필" /></a> | <a href="https://github.com/choubung"><img src="https://github.com/choubung.png?size=160" width="88" alt="파도 GitHub 프로필" /></a> | <a href="https://github.com/RealTake"><img src="https://github.com/RealTake.png?size=160" width="88" alt="에덴 GitHub 프로필" /></a> |
|                                               [@5jonyuk](https://github.com/5jonyuk)                                               |                                               [@Sauter001](https://github.com/Sauter001)                                               |                                               [@choubung](https://github.com/choubung)                                               |                                               [@RealTake](https://github.com/RealTake)                                               |
