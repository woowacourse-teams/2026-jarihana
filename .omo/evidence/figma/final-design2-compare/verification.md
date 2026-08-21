# Figma 디자인 기준 및 구현 검증

## 확정 범위

- Figma file: `4FGyuqPPK0Vuv4FipZBTgF`
- 탐색·상세·마이페이지 등 일반 화면: `최종 디자인 2` canvas `438:2657`
- 모임 생성·모임 정보 수정·모임장 관리: `최종 디자인` canvas `354:1479`의 초안 프레임
- 프론트엔드는 구현 우선으로 진행했다. 기존 테스트는 구현이 끝난 뒤 회귀 검증에만 사용했다.

## 적용한 초안 프레임

| 기능           | Figma node           | 구현 판단                                                         |
| -------------- | -------------------- | ----------------------------------------------------------------- |
| 모임 생성      | `462:1337`           | 민트색 기본정보/일정/대표이미지 hero와 Markdown 소개 편집기 적용  |
| 모임 정보 수정 | `394:2460`, `445:23` | 관리 탭, 편집 hero, Markdown 소개, 일정 저장과 lifecycle API 결합 |
| 모집 관리      | `445:144`            | 현황 4개, 모집 조건 form, 공개 상태 rail, 모집 내역으로 재구성    |
| 신청 관리      | `399:1435`           | 신청자 목록과 실제 멤버/모집 상태 rail 유지                       |
| 멤버 관리      | `445:252`            | 검색/과정 필터/표 구조 적용, API가 지원하는 모임장 위임만 제공    |

## 백엔드 계약에 따른 조정

- 대표 이미지 업로드 API가 없으므로 `/images/default-group.png`와 서버 제공
  `representativeImageUrl`을 읽기 전용으로 사용한다.
- 모집 수정·재오픈 API가 없으므로 모집 생성과 마감만 제공하며 UI에 제한을 명시한다.
- 멤버 강제 퇴장 API가 없으므로 가짜 `내보내기` 버튼을 만들지 않고 모임장 위임을 제공한다.
- 멤버 검색은 현재 로드한 cursor 페이지 범위에서만 동작한다고 설명한다.
- 모임 기본정보 수정과 일정 변경은 각 실제 endpoint에 분리해서 보낸다.

## 실제 화면 확인

- 로컬 백엔드 회원 1의 실제 데이터로 `/groups/new`, `/groups/1/manage`,
  `/groups/1/manage/recruitments`, `/groups/1/manage/members`,
  `/groups/1/manage/recruitments/1/registrations`를 확인했다.
- 1440px에서 초안의 좌측 편집 canvas와 관리 dashboard hierarchy를 확인했다.
- 768px와 360px에서 모든 화면의 `document.scrollWidth`가 viewport와 같았다.
- 모바일 요일 이름은 단어 중간에서 줄바꿈되지 않으며, 서버 기본 대표 이미지가 로드됐다.

## 검증

- `npm run lint`: exit 0
- `npm test -- --runInBand`: 41 suites, 259 tests passed
- `npm run build`: exit 0
- build warning: 기존 `my-profile-illustration` 및 main bundle size advisory 2건
