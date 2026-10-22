# 서버별 배포 작업의 실행 허가와 결과

이 문서는 coordinator가 앱 A/B의 child 작업을 호출할 때 사용할 코드 계약이다.
현재는 라이브러리·읽기 전용 검증 CLI·로컬 앱 e2e에 연결했다.
**GitHub dispatch/download 라이브러리는 로컬 HTTP로 검증했다. EC2 신원 조회, 원격 최신 허가 조회와 workflow는 아직 미연결이다.**
기존 prod workflow는 계속 기존 배포 방식이며, 이 코드만으로 운영 배포가 바뀌지 않는다.

## 요청과 결과 흐름

```text
coordinator: command intent 저장 → child run 확인 → 정확한 run/attempt 저장
                                       |
앱 child: 승인된 control ref/SHA + 실제 머신 + 최신 명령 허가 확인
          → 고정 작업 실행 직전 재확인
          → 실행 결과와 종료 증거를 하나의 JSON으로 생성
                                       |
coordinator: 최신 pending 명령·정확한 run·artifact 검사
             → 정상 결과만 저널에 수용 → 다음 단계

기한 만료·취소·다른 run/boot·증거 누락 → 실패 / cleanup 보류
```

`child_execution.py`의 `ChildGate`는 매 호출마다 `JournalReader.read()`로 최신 상태를 읽는다.
저널의 command ID·phase·deadline·parent run/attempt·pending child run과 topology digest를 비교한다.
승인된 control workflow/ref/SHA, `workflow_dispatch`, 첫 attempt만 허용한다.
허가 철회는 다음 검사에서 반영하며 최초 입력 JSON을 캐시해 계속 실행하지 않는다.

`MachineIdentity`는 환경·고정 host ID와 실제 instance ID를 함께 대조하기 위한 값이다.
프로세스가 있으면 관리 API의 환경·host·boot도 확인한다. PREPARE만 기존 프로세스 없이 시작할 수 있고,
현재 대기 slot만 준비할 수 있다. 상태 변경에는 정확한 boot가 필요하다.
EC2 시작·중지와 Nginx 전환은 앱 child에서 수행할 수 없다.

실제 연결 시 `ChildContext.run`은 GitHub가 반환한 실행 정보로 검증해야 한다. 입력 JSON이나
`GITHUB_RUN_ID`만 신뢰해 검증을 완료했다고 할 수 없다. 실제 instance ID도 AWS 메타데이터 등에서
확인해야 한다. 로컬 e2e에서는 이 두 값이 명시적인 fixture다.
원격 `JournalReader`에는 인증·출발지 제한·요청 timeout·최신 조회가 필요하다.
오래된 state.json 복사본을 앱 서버에 전달하는 것으로 대체하지 않는다.

## 결과 파일 계약

`child_artifacts.py`의 `ChildArtifact`는 최대 64 KiB의 JSON이다.

```text
schema_version: 1
receipt:
  schema_version: 1
  command: 원래 명령 전체
  run: 정확한 workflow/ref/SHA/event/run ID/attempt
  success: true
  status: 환경·instance·host·boot·이미지·worker·실제 활동 수치
shutdown: STOP_APP의 ShutdownEvidence, 그 외에는 명시적인 null
```

Boolean·카운터·버전은 엄격하게 읽는다. 문자열 `"true"`나 버전의 `true`를 1로 변환하지 않는다.
`normal_exit`, HTTP 수치와 background 상태는 명시해야 한다. 알 수 없는 필드와 스키마 누락도 거부한다.
검증 오류에 원문 payload나 비밀값을 출력하지 않는다.

STOP_APP은 `success=true`만으로 통과하지 않는다. 다음을 추가 검사한다.

- 종료 증거의 command ID·boot와 receipt·명령이 일치한다.
- 앱이 정지했고 worker·HTTP·업무 스케줄러가 drain됐으며 이전 worker 권한을 보유하지 않는다.
- 종료 코드는 0/143이고 컨테이너 시작 시각 뒤에 종료됐다. 미래 시각은 초안 오차 5초 이내만 허용한다.
- 현재 저널의 sealed cleanup 허가와 deadline이 여전히 유효하다.

컨테이너 세대·OOM·재시작 검사는 증거를 생성하는 [Docker 종료 어댑터](README.md#앱-종료-증거)가 담당한다.
artifact 검증은 실제 Docker 조회를 대신하지 않는다. 종료 증거는 다른 명령으로 재사용할 수 없다.
부모 저널에는 기존 `Receipt` 형식으로 변환해 저장하므로 파일 재조회와 CAS 비교도 같은 타입을 사용한다.

JSON 내부의 ID 검사는 파일의 출처 검증과 별개다. 실제 GitHub 어댑터는 정확한 child run/attempt의
성공 conclusion·artifact ID·만료 여부를 확인하고, ZIP의 크기·파일 수·경로도 제한해야 한다.
다운로드 어댑터는 [GitHub 연결 계약](github-actions-adapter.md)에 구현 범위를 기록했다.
producer/consumer workflow의 실제 연결과 GitHub 권한 검증은 아직 남아 있다.

## 읽기 전용 검증 CLI

```sh
uv run infra/scripts/deploy/verify-child-artifact.py \
  topology.json /var/lib/jarihana-deploy/prod/state.json child-result.json
```

종료 코드 0은 **현재 pending 명령에 대한 파일 내용 검증 성공**이다. 1은 입력/계약 검사 실패,
2는 잘못된 사용법이다. 성공 시 command ID·run ID·attempt만 출력하고 저널이나 서버를 변경하지 않는다.
이미 완료·취소된 배포의 결과로 새 작업을 승인하지 않으므로, 나중에 보관된 artifact와 완료 저널을
넣으면 실패하는 것이 정상이다. 이 CLI는 GitHub 파일 출처·권한 검증 또는 실행 허가 API가 아니다.

## 현재 검증과 다음 연결

로컬 e2e는 매 작업의 실제 Spring 상태를 읽고 `ChildGate`를 통과한 뒤 고정 작업을 호출한다.
worker POST 직전과 Docker 종료 polling 중에도 재검사한다. `child-<command ID>.json`을 생성하고
coordinator 쪽 `accept_artifact()`로 수용한 결과만 반환한다.
실제 Docker 종료 시각과 비교할 수 있도록 가상 관찰 시계는 실행 시작의 실제 UTC에 맞춘다.
900초 관찰은 여전히 가상 시간이며, 실제 GitHub·AWS·telemetry는 fixture다.

GitHub 전송 어댑터의 로컬 HTTP 검증 다음은 앱의 실제 신원·인증된 최신 허가 조회를 연결하는 작업이다.
그 뒤 Compose·coordinator/child workflow·관측을 연결한다. 실제 두 EC2 시작·중지는 별도 비운영 리허설에서
검증하고, 추가 dev EC2가 필요한 시점에 준비 사항을 안내한다.
