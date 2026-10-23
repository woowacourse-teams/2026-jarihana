# GitHub Actions 배포 작업 연결

`GitHubApplications`는 coordinator가 앱 서버 runner에게 작업을 요청하고 결과를 받는 라이브러리다.
**읽기 전용 STATUS를 검증했으며 전체 GitHub 배포 workflow는 아직 연결하지 않았다.** 기존 prod workflow는 변경하지 않았다.
EC2 IMDS 신원·인증된 원격 최신 허가 조회는 별도 어댑터와 실제 B→Nginx 격리 시험까지 구현했다.
읽기 전용 STATUS child workflow는 실제 B runner에서 성공했고 부모의 GitHub run/artifact 검증도 통과했다.
상태 변경 child 작업과 Compose·AWS·관측 연결은 후속 작업이다.

## STATUS 전용 Nginx 부모

`backend-bluegreen-status-coordinator.yml`은 전용 coordinator runner에서
`status-coordinator.py`를 실행한다. 현재는 feature 브랜치에서 수동으로 시작하는 읽기 시험이며,
main 병합 배포와는 연결하지 않았다. push 이벤트는 hosted runner의 workflow 등록 작업만 실행한다.

```text
수동 workflow_dispatch
  -> Nginx runner: IMDSv2 + 실제 GitHub 부모 run/attempt/ref/SHA 확인
  -> 관리자 설정의 B boot/image로 STATUS 명령 생성
  -> 로컬 저널 기록 -> child dispatch 1회 -> 정확한 child run 연결
  -> B: 최신 허가와 신원 확인 -> 앱 관리 GET -> 결과 artifact 업로드
  -> Nginx: run/attempt + ZIP digest + 결과 + 최신 허가 검증
  -> COMPLETE / pending 제거 / receipt 보존
```

부모 job에만 `actions: write`를 부여하고 실행 중의 `github.token`을 환경변수로 전달한다.
별도 장기 토큰을 서버 설정에 저장하지 않는다. `GITHUB_TOKEN`으로 `workflow_dispatch`를 발생시킬 수 있다는
근거는 [GitHub 공식 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)다.
실제 Nginx 부모의 `github.token`으로 B child dispatch와 결과 수집이 성공했다.

Nginx의 `/etc/jarihana-deploy/status-coordinator.json`은 root 소유·coordinator 그룹 읽기(0640)로 준비한다.
기준은 [현재 dev 시험 설정](status-child/coordinator.example.json)이며 prod용 설정이 아니다.
실제 child의 기존 고정 tag/SHA를 유지하고, 부모는 고정 feature ref와 실행 중인 GitHub 메타데이터를 대조한다.
B의 boot/image는 직전 실제 검증값으로 고정한다. 앱을 재시작·교체했다면 먼저 새 신원을 확인하고 관리자 설정을
갱신해야 하며 입력값이나 마지막 성공값을 무조건 새 신원으로 수용하지 않는다.

`StatusCoordinator`는 기존 `StateStore`·`GitHubApplications`를 사용한다. controller lock과 CAS로
동시 부모와 기록 덮어쓰기를 차단하며, 대기 중 heartbeat를 갱신한다. 명령 상한은 300초, polling은 5초다.
POST 응답을 잃으면 고유 실행을 기한 안에서 찾고 재전송하지 않는다. 실패·시간 초과·중복 실행은
`NEEDS_ATTENTION`으로 pending과 run을 보존한다. 다음 실행과 UI rerun으로 덮어쓸 수 없으며 사람이 조정해야 한다.
별도 작성자가 허가를 철회하면 그 기록도 덮어쓰지 않는다. 이 시험의 저널에는 아직 watchdog을 설치하지 않았다.
부모가 강제 종료되어 PREPARING이 남아도 자동 재실행은 차단되며 앱 상태 변경은 수행하지 않는다.

artifact 다운로드는 기본적으로 관리자 설정의 정확한 호스트만 허용한다. 실제 시험에서 인증된 GitHub API가
반환한 서버가 `productionresultssa2`에서 `productionresultssa8`로 바뀌어 수집이 차단됐다.
이를 위해 부모 관리자 설정에서만 `allow_github_result_storage: true`를 사용한다. 이 설정은
`productionresultssa[0-9]+.blob.core.windows.net` 형식만 추가 허용하며, 임의 Azure 계정·유사 도메인·HTTP·
사용자정보·명시적 port·fragment는 계속 거부한다. GitHub API가 정확한 run의 artifact에 반환한 URL만 사용한다.
다운로드는 인증정보 없는 별도 client를 사용하고 추가 redirect를 따라가지 않으며 ZIP 크기·digest 검사도 유지한다.
[GitHub 공식 문서](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)는 artifact 통신에
`*.blob.core.windows.net`이 필요하다고 명시한다. 위 숫자형 prefix는 실제 응답에 근거해 더 좁힌 정책이며,
GitHub가 향후 다른 형식을 쓰면 자동 허용하지 않고 실패로 보존한다. 서명 URL은 출력하지 않는다.
완료 결과는 영속 저널과 부모의 `state.json`·`receipt.json` artifact에 남긴다.

저장소 호스트 변경 회귀를 포함한 로컬 154개 테스트, 새 workflow 정적 검사와 실제 B 상태 조회는 통과했다.
실제 부모 [39959099088](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/39959099088)는
수정 SHA `b253ec6b90c08900b1b00038feb7db9014ee1681`의 첫 attempt로 Nginx runner 30에서 성공했다.
부모가 요청한 child [39959136131](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/39959136131)는
기존 고정 tag/SHA의 첫 attempt로 B runner 29에서 성공했다. 두 실행의 실제 metadata·runner를 대조했고,
자식 artifact와 부모 artifact의 크기·digest·내용을 검증해 Nginx의 영속 저널·receipt와 일치함을 확인했다.
최종 저널은 `COMPLETE`, pending·pending_run은 비었고 기존 B 컨테이너·boot·이미지와 `PAUSED` 상태가 유지됐다.
이는 읽기 전용 STATUS 자동화의 검증이다. 앱 상태 변경·worker 인계·Nginx 전환·EC2 기동/중지·15분 관찰·
자동 rollback을 이 부모 workflow로 검증한 것은 아니다.

## 요청 흐름

```text
coordinator의 현재 pending 명령
  → 저장소 ID·이름 / control tag → 승인된 SHA / workflow 경로 확인
  → dispatch POST 한 번
  → 정확한 run ID와 첫 attempt 확인 → Session이 저널에 pending_run 저장
  → child가 최신 허가를 확인하고 작업 실행 [원격 조회 어댑터 구현, workflow 연결은 후속 작업]
  → 같은 run/attempt의 success + 정확한 artifact 이름 확인
  → ZIP 내려받기 → 크기·SHA-256·단일 JSON 검사
  → run 재확인 + 최신 pending 허가 확인 → accept_artifact → Receipt 반환
```

dispatch 응답을 잃으면 같은 명령을 다시 POST하지 않는다. 고유한 run-name으로 모든 조회 페이지를 확인하며,
정확히 한 실행일 때만 기존 `Session`이 연결한다. 없거나 여러 개면 보류한다. 검색이 잘리거나 조회 중 총수가
바뀌어도 결과를 추측하지 않는다. API의 일시적인 반영 지연도 첫 도입에서는 보류할 수 있다.

200 응답의 `workflow_run_id`를 사용한다. 204·해석할 수 없는 200·POST 통신 유실·5xx는 실행 여부가
불명확한 결과다. 403 등 권한 오류는 실패이며, 성공한 조회만으로 dispatch 권한을 입증하지 않는다.
읽기 연결 오류만 제한된 transport 재시도를 사용하고 POST는 자동 재시도하지 않는다.
200 dispatch 응답 직후 run 정보가 아직 완성되지 않은 경우 exact run 조회를 최대3회 수행한다.
각 재조회 전에도 현재 허가를 검사하며, 불일치가 지속되면 실패한다. 다른 run을 선택하거나 POST를 반복하지 않는다.
current run과 attempt 조회 사이의 정상적인 상태 변경은 최대3쌍의 조회로 확인한다.
상태·결론만 엇갈렸을 때 1초 간격으로 재조회하며, run ID·attempt·ref·SHA 등 신원 불일치는 즉시 거부한다.
429·조회 실패·시간 초과를 정상으로 바꾸지 않으므로 실제 API 지연이나 사용량 제한 때 보류될 수 있다.

## 후속 workflow가 지켜야 할 계약

| 항목 | 값 |
| --- | --- |
| 이벤트 | `workflow_dispatch` |
| 실행 ref | topology의 `refs/tags/...`에서 `refs/tags/`를 뺀 tag 이름 |
| 입력 | `command` 전체 JSON, `deployment_id`, `command_id`, `slot` |
| run-name | `bg-<deployment_id>-<command_id>` |
| artifact 이름 | `child-result-<deployment_id>-<command_id>-<run_id>-1` |
| artifact 내용 | 루트의 `child-result.json` 한 개, 기존 ChildArtifact 계약 |
| 재실행 | 첫 attempt만 허용. UI에서 rerun한 attempt 2 결과는 거부 |

child는 실행 ID·차수·SHA를 실제 GitHub 정보와 대조하고, 저널에 자기 `pending_run`이 저장되기 전에는
부작용을 실행하면 안 된다. 이 대기·원격 허가 확인은 후속 workflow/reader 작업이다.
STATUS child는 현재 명령이 유효하고 pending_run만 미기록인 동안 최대30초 기다린다.
대기 중에도 최신 저널을 읽고 기한·철회를 확인하며, 연결된 뒤 정확한 run/머신/boot 검사를 통과해야 한다.
runner를 고르는 `slot` 입력만으로 머신 신원을 증명하지 않으며 실제 instance ID와 로컬 boot 검사가 필요하다.
작업 실패를 `continue-on-error`로 숨기거나 결과 파일만으로 성공 처리하면 안 된다.
자동 취소 요청의 202도 작업이 이미 종료됐다는 증거가 아니므로 즉시 EC2를 중지할 근거가 아니다.

제어 코드는 보호된 tag/SHA로 배포하고 tag 이동 권한을 제한해야 한다. 앱 이미지 digest와 제어 코드 SHA는
별개다. tag를 바꾸면 전송 전에 중단하며, 전송 직후 이동하더라도 다른 SHA의 실행 결과를 수용하지 않는다.
이 검사가 GitHub의 tag 보호 설정이나 runner 격리를 대신하지 않는다.

## 설정과 인증 경계

운영 조립 코드에서 `github_clients()` context manager로 HTTP 클라이언트를 만들고,
`GitHubHttp(clients, SecretStr(token), clock)`과 `GitHubContext(repository_pin, topology)`를
`GitHubApplications(api, context, journal)`에 전달한다. 여기서 journal은 coordinator의 실제 StateStore다.
현재는 이를 설치·실행하는 coordinator CLI나 workflow를 추가하지 않았다.

- `RepositoryPin`에 저장소 `owner/repo`와 변경되지 않는 숫자 repository ID를 함께 지정한다.
- API 주소는 production factory에서 `https://api.github.com`으로 고정한다. 토큰은 파일 예시나 저널에 쓰지 않는다.
- 앱 설치 토큰 또는 제한된 토큰에 Actions read/write와 control tag 조회에 필요한 Contents read를 준비한다.
  실제 토큰 종류·조직 정책·GitHub Actions 자체 dispatch 제약은 dev에서 확인해야 한다.
- 다운로드 host는 실제 GitHub가 반환한 URL의 host를 확인해 정확한 이름으로 허용한다. wildcard나 임의 URL은 받지 않는다.
  로컬 fixture의 `results.example`은 운영 주소가 아니다. 이 목록이 없거나 다르면 다운로드가 실패한다.
- GitHub API의 redirect는 따라가지 않는다. ZIP의 302 Location은 HTTPS·허용 host·사용자 정보/명시적 포트 없음만 허용한다.
  별도의 인증 없는 클라이언트로 내려받고 추가 redirect도 거부하므로 GitHub 토큰을 전달하지 않는다.
- JSON 응답은 2 MiB, ZIP은 256 KiB, 결과 JSON은 64 KiB로 제한한다. 검색은 최대 1,000개이며 초과하면 보류한다.
  이 값들은 작은 child 결과를 위한 초기 제한이다. 실제 결과 크기·API 형태를 dev에서 확인한다.
- artifact 만료·저장소/run/SHA 불일치·중복·digest 누락/불일치·경로 이탈·symlink·다중 파일을 거부한다.
  ZIP은 메모리에서 제한적으로 읽으며 디스크에 풀지 않는다. 수집 중 rerun·watchdog 허가 철회도 실패다.
- 토큰, 서명 URL, 응답 원문은 오류 메시지에 포함하지 않는다. TLS 검증과 HTTP/2를 사용한다.
  `Accept-Encoding: identity`를 요청하고 인코딩된 응답은 거부해 입력 크기 제한을 명확하게 유지한다.

## 검증 범위

```sh
uv run infra/tests/deploy/run_tests.py
```

실제 localhost HTTP 서버로 dispatch·실행 조회·artifact metadata·취소 요청을 처리한다. 서명된 HTTPS 다운로드는
httpx2의 HTTP transport fixture로 응답하며 실제 GitHub 저장소나 다운로드 서비스에는 접근하지 않는다.
따라서 GitHub 권한·실제 서비스 응답 형태·tag 보호·runner 선택·실제 artifact 업로드 digest를 증명하지 않는다.
로컬 테스트 환경은 종료 시 정리하고 테스트 코드는 회귀 검증을 위해 유지한다.

API 계약은 [GitHub workflow 문서](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10),
[실행 조회·취소 문서](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10),
[artifact 문서](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2026-03-10)를 기준으로 했다.
실제 child workflow를 붙일 때 해당 API 버전·응답·권한을 다시 확인한다.
