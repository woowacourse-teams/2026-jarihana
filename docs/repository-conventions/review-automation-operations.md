# 리뷰 자동화 운영 안내

## 게이트 결과 게시 방식 전환

현재 운영은 `Conditional Review Gate` 체크를 필수로 요구한다. Checks API로 새 체크를 만들어도 예전 실행 묶음에 연결될 수 있으므로, 새 버전은 `Review Approval Policy`라는 별도 커밋 상태를 함께 게시한다. 워크플로 이름은 `Conditional Review Gate`를 유지한다.

1. 수정 PR의 CI와 사람 검토를 마친 후 `develop`과 기본 브랜치 `main`에 반영한다. 새 게이트 코드는 항상 main에서 읽으므로 develop만으로는 전환되지 않는다. main에 함께 들어가는 변경과 배포 영향을 확인한다.
2. 저장소 변수 `REVIEW_GATE_LEGACY_CHECKS`는 미설정 또는 `true`로 둔다. 이 단계에서는 기존 체크와 새 상태를 함께 게시하며 기존 필수 항목을 유지한다.
3. 아래 검증표를 실제 테스트 PR에서 확인한다. Checks 탭과 커밋 상태 API에서 `Review Approval Policy`가 올바른 head SHA에 게시되는지 확인하고, GitHub Actions가 출처로 식별되는지 확인한다. 특히 같은 head의 본문 편집·재오픈과 승인 제출·취소를 반복해 `Expected`가 남지 않는지 확인한다. 단순히 워크플로가 성공한 것만으로 검증을 끝내지 않는다.
4. ruleset에 `Review Approval Policy`를 GitHub Actions 출처로 필수 등록하고 해당 상태가 필수 항목으로 인식되는지 확인한다. 기존 `Conditional Review Gate`도 아직 유지한다. 출처를 검증할 수 없다면 임의로 Any source로 바꾸지 말고 여기서 원인을 확인한다.
5. 새 필수 상태의 미승인 고위험 차단과 승인 후 통과를 확인한 뒤, 기존 필수 체크 `Conditional Review Gate`만 제거한다. Backend Test·Frontend Verify·Frontend E2E, PR 필수·최신 base 반영 등 나머지 규칙은 유지한다. 최종적으로 low/medium 승인 없는 통과와 high 승인 전 차단·승인 후 통과를 병합 영역에서 확인한다.
6. 전환 후 저장소 변수 `REVIEW_GATE_LEGACY_CHECKS=false`를 설정해 기존 체크 게시를 중단한다. 예약 검사와 main 기준 수동 실행에서도 새 상태가 유지되는지 확인한다.

체크와 커밋 상태를 같은 이름으로 만들면 GitHub가 둘 다 요구할 수 있어 이름을 구분한다. [GitHub 필수 상태 검사 안내](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

`CODEOWNERS` 등록만으로 승인이 필수가 되는 것은 아니다. 이번 정책은 위험도별로 리뷰 요청 자체를 줄이므로 모듈 담당자는 `review-owners.yml`에서 관리하고, 코드 소유자 승인 강제는 켜지 않는다.

## 저장소 설정

`Settings → Secrets and variables → Actions`에 아래 값을 둔다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Secret | `SLACK_BOT_TOKEN` | 설치한 Slack 앱의 Bot User OAuth Token. 코드·PR 본문에 넣지 않는다. |
| Variable | `SLACK_REVIEW_CHANNEL_ID` | `C0CBT63TMAP` |
| Variable | `SLACK_REVIEW_USER_IDS` | 아래 GitHub 아이디와 Slack 사용자 ID의 JSON 매핑 |
| Variable | `REVIEW_GATE_LEGACY_CHECKS` | 전환 중에는 미설정 또는 `true`, 새 필수 상태 전환 후 `false` |

```json
{"Sauter001":"U0C5DKTCF7H","choubung":"U0C5US0LYHG","RealTake":"U0C5Y1ZMDQS","5jonyuk":"U0C5PN97BCM"}
```

Slack 앱에 `chat:write` Bot scope를 주고 워크스페이스에 설치한 뒤, 알림 채널에 봇을 초대한다. 권한을 바꾼 경우 재설치가 필요할 수 있다. GitHub Actions가 활성화되어 있어야 하며, 각 job은 워크플로에 선언된 최소 권한으로 실행한다. 별도 개인 토큰은 사용하지 않는다.

## 실제 동작 확인

필수 항목을 전환하기 전에는 기존 게이트를 유지한 채 새 커밋 상태를 확인한다. 기존 체크가 `Expected`여도 새 상태 검증을 건너뛰거나 승인 요건을 제거하지 않는다.

| 확인 상황 | 기대 결과 |
| --- | --- |
| 일반 경로의 `low`와 `medium` PR | `Review Approval Policy` 성공, 자동 리뷰 요청 없음 |
| 제목만 수정 | 자동 배정 건너뜀. 커밋 상태를 재평가하고 현재 head의 기존 유효 승인을 인정 |
| 제목과 본문 또는 base를 함께 수정 | 위험도와 변경 범위를 정상 평가 |
| 일반 경로의 `high` PR | 작성자 외 추천 리뷰어 요청 1명, 그 사람을 Slack으로 멘션, 승인 전 게이트 실패 |
| `low` 선언이지만 자동 고위험 경로 수정 | 게이트가 승인 요구, 명확한 추천 또는 담당자 매핑으로 리뷰 요청 |
| 현재 head에 작성자 외 쓰기 권한자가 승인 | 재평가 후 게이트 성공 |
| 이미 현재 head 승인을 받은 PR의 본문 수정 | 기존 요청이 없어도 유효 승인 확인 후 재요청·Slack 알림 없음 |
| 같은 head에서 `low` → `high` 본문 수정, 승인 없음 | 이벤트 재평가 후 게이트 실패 |
| 승인 취소 또는 새 커밋 추가 | 재평가 후 게이트 실패, 현재 head의 유효 승인 필요 |
| 같은 head에서 본문 편집 또는 PR 재오픈 반복 | 새 상태가 최신 판정을 반영하고 실행 묶음 차이 때문에 Expected로 남지 않음 |
| 같은 head의 low PR과 미승인 high PR이 함께 열림 | 공유 커밋 상태 실패. low 판정이 high의 승인을 대신하지 않음 |
| 평가 중 PR 구성·head·본문·리뷰가 바뀜 | 새 커밋 상태 실패, 다음 재평가 필요 |
| 변화 없는 예약 검사 반복 | 새 상태 기록을 추가하지 않음. 결과나 입력 변화로 재평가가 필요하면 갱신 |
| 위험도 누락·잘못된 표기 | 게이트는 본문 수정 요구. 이것만으로 승인이나 승인 마감 알림을 요구하지 않음 |
| 사람이 수동으로 개인 리뷰 요청 | 해당 사람에게 Slack 멘션 |
| 영업일 마감이 지났고 승인 필요·미승인 | 현재 리뷰 요청 대상에게 마감 알림. 저장된 완료 표시가 있으면 재발송하지 않음 |
| 주말·한국 공휴일 또는 현재 달력 조회 실패 | 마감 알림 발송 안 함 |

자동 배정은 작성 AI의 `자동 배정 리뷰어:` 추천을 우선한다. 추천이 없으면 모든 변경 경로가 한 모듈에 속할 때만 주·백업 담당자를 추정하며, 프론트엔드·인프라만의 변경은 열린 리뷰 요청 부하로 선택한다. 기존 개인·팀 요청은 바꾸지 않는다. 담당 미정 경로가 섞이면 작성자가 추천을 보완하거나 수동 요청해야 한다.

## 알림의 범위와 한계

- 마감은 **PR 생성 시각**에서 계산한다. 초안 해제·리뷰 요청·재요청 시각으로 다시 시작하지 않는다. PR 댓글에서 합의한 새 마감도 자동으로 읽지 않으므로 별도 조정이 필요하다.
- 즉시 요청 알림은 주말·공휴일에도 보낸다. 영업일 제외 규칙은 마감 계산과 마감 알림에 적용한다. 한국 전국 공휴일은 Nager.Date 공개 API를 사용하며 회사 휴무일은 별도로 반영하지 않는다.
- 마감 검사는 KST 평일 14:00·21:00에 예약되어 있지만 GitHub 실행 대기로 늦어지거나 누락될 수 있다. 복구가 필요하면 `Slack Review Notifications`를 **main 기준**으로 수동 실행한다. 수동 실행도 현재 영업일과 실제 마감 경과 여부를 확인한다. 21:00 권장 알림은 해당 날짜에만 보낸다. [GitHub 예약 실행 설명](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- 마감 알림은 PR과 각 슬롯별 1회를 목표로 하며 새 커밋마다 다시 보내지 않는다. 필수 마감이 14일 넘게 지난 PR은 자동 리마인더 대상에서 제외되므로 작성자가 직접 재조정한다.
- Slack 전송 후 Actions artifact에 완료 표시를 남긴다. 전송은 성공했지만 완료 표시 저장이 실패한 경우나 관리자가 artifact를 삭제한 경우에는 중복 알림이 가능하다. 정확히 한 번의 전송을 보장하지는 않는다.
- 본문·리뷰 변경과 상태 갱신은 원자적이지 않다. 이벤트 전달·runner 대기 중 이전 성공이 잠시 보일 수 있으므로 최신 입력의 재평가 결과를 확인한 뒤 병합한다. AI가 의미상 위험을 낮게 잘못 분류한 경우도 경로 검사만으로 모두 잡을 수는 없다.
- PR 목록 자체를 조회하지 못하면 변경 이벤트에 포함된 head는 실패로 표시한다. 예약 실행에서 전체 목록을 조회하지 못하거나 상태 쓰기 자체가 실패하면 모든 이전 상태가 무효화되었다고 보장하지 않는다. Actions 실패를 확인하고 복구 후 재평가한다.

## 실패 시 확인과 복구

| 증상 | 확인 및 조치 |
| --- | --- |
| 자동 배정이 없음 | Draft 여부, 위험도, 기존 리뷰 요청, 추천 GitHub 아이디, 변경 경로 매핑을 `assign-reviewer` 로그에서 확인 |
| 배정은 됐지만 Slack이 안 옴 | `notify-assigned-reviewer`의 사용자 매핑·채널·봇 권한 오류 확인. 실패한 job만 재실행해 기존 배정 output으로 재시도 |
| 수동 요청 알림이 안 옴 | `review-request-notification` 로그와 Slack 매핑 확인. 개인 리뷰 요청만 지원하며 팀 요청은 멘션하지 않음 |
| 게이트는 성공했지만 필수 체크가 Expected로 남음 | 필수 이름이 아직 `Conditional Review Gate`라면 체크 실행 묶음 문제일 수 있음. 위 전환 절차를 따라 새 상태를 검증한다. 새 이름이 필수라면 head SHA·게시 출처·실제 상태 확인 |
| 새 상태가 안 보임 | main의 게이트 코드, `statuses: write` 권한 및 상태 API 오류 확인. develop 머지만으로는 운영 코드가 바뀌지 않음 |
| 게이트가 갱신되지 않음 | PR 이벤트 실행 및 `Review Policy Review Events` → `Conditional Review Gate` 연결 확인. 필요하면 main에서 게이트를 수동 실행 |
| 공휴일 API 실패 | 알림을 보내지 않은 채 실패함. 복구 후 다음 영업일에 스캔을 재실행 |
| 마감 알림 job 실패 | Slack 전송 여부와 완료 artifact 저장 여부부터 확인하고 재시도. 전송 성공 후 artifact만 실패했다면 재실행으로 중복 멘션될 수 있음 |

게이트 장애 때문에 병합을 계속할 수 없다면 관리자와 원인을 확인하고, 조건부 게이트 필수 요건을 해제하기 전에 전역 승인 1개와 최신 푸시 승인 요구부터 복원한다. 고위험 PR이 검토 없이 통과하는 상태를 만들지 않는다.
