# 파일 전송으로 인한 배포 지연 개선

5분 관찰과 기존 복구 조건을 유지하면서 파일마다 반복하던 요청을 줄인다.
20분 안팎은 운영에서 검증할 목표이며, 아래 로컬 검증이나 단일 조회 측정으로 달성을 보장하지 않는다.

## 확인한 병목

2026-11-06의 [운영 실행 42166254451](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/42166254451)은
48분 21초가 걸렸다. plan은 16분 16초, switch는 14분 1초, seal은 4분 28초였고,
세 단계 합계는 34분 45초다. 프론트 artifact에는 161개 파일, 약 20.9 MB가 들어 있었다.
파일 용량보다 파일마다 새 AWS CLI 프로세스를 띄우고 순서대로 요청하는 비용이 컸다.

SSM으로 확인한 coordinator는 t4g.micro, 메모리는 916 MiB였다. 같은 manifest에 대한
S3 HEAD 12회를 호스트 AWS CLI 2.38.0으로 조회하면 순차 실행 8.74초, 4개 병렬 4.74초였다.
단일 조회의 최대 RSS는 61,472 KiB였다. 이 결과를 근거로 동시 실행 수를 4로 제한했다.
실제 workflow는 별도로 설치한 AWS CLI 2.38.5를 사용하므로 이 측정은 실제 배포 시간의 대체값이 아니다.
측정은 읽기만 수행했고 EC2, Nginx, S3 파일이나 배포 pin을 변경하지 않았다.

## 변경 범위

| 작업 | 이전 | 개선 |
| --- | --- | --- |
| 원본 업로드 | PUT 후 같은 파일을 GET하여 비교 | SHA-256을 포함한 PUT 후 S3 체크섬 응답 비교 |
| 게시 전 원본 다운로드 | 순차 다운로드 후 전체 해시 검사 | 4개씩 다운로드하고 각 파일의 크기와 해시 검사 |
| 공개 파일 업로드 | PUT 후 같은 파일을 GET하여 비교 | SHA-256을 포함한 PUT 후 S3 체크섬 응답 비교 |
| 공개 URL 검사 | 전체 파일 순차 검사 | 전체 파일을 4개씩 검사 |
| 최종 확정 | 원본 전체 다운로드 후 공개 파일 전체 검사 | manifest의 실행 정보 대조 후 공개 파일 전체 검사 |

S3는 요청에 제공한 체크섬과 업로드 바이트가 다르면 오류를 반환한다.
코드는 성공 응답의 `ChecksumSHA256`도 기대값과 비교하고 누락이나 불일치를 실패로 처리한다.
[AWS PutObject 설명](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html)과
[업로드 무결성 검증](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)을 따른다.

새 파일 N개에 대한 S3 호출은 원본 보관, 게시, 최종 확정을 합쳐 `7N`에서 `4N`으로 줄어든다.
161개 기준 1,127회에서 644회로 483회, 약 43% 감소한다. 이 수치에는 기존 릴리스 확인,
manifest와 상태 pointer 갱신, 공개 HTTP 검사, GitHub API 호출은 포함하지 않는다.
GitHub 실행 확인의 10초/30초 캐시와 API 예산, 기한, watchdog은 유지한다.

로컬 Docker의 Bash 5.2에서 이전 릴리스와 새 릴리스를 각각 161개 파일로 구성하고,
S3/공개 HTTP 요청 대역에 매번 50ms 지연을 넣어 같은 순서로 비교했다.

| 파일 처리 구간 | 기존 코드 | 개선 코드 |
| --- | ---: | ---: |
| 준비 `fe_stage` | 62.82초 | 17.35초 |
| 게시 `fe_publish` | 71.25초 | 18.47초 |
| 확정 `fe_finalize` | 33.37초 | 5.05초 |
| 합계 | 167.44초 | 40.88초 |

이 시험에서 S3 GET은 972회에서 489회로 줄고 PUT은 327회로 같았다.
공개 HTTP 전체 검사는 두 코드 모두 483회였다. 약 76% 단축은 이 모의 파일 처리 구간의
결과다. 빌드, 앱 준비와 worker 인계, 300초 관찰, 실제 CLI 시작 비용, EC2 CPU/메모리 제약은
이 벤치마크에 포함하지 않았으므로 전체 운영 배포의 단축률로 해석하지 않는다.

원본의 조건부 생성, pointer CAS, 이전 파일 보관, 파일 전체 SHA-256 검사와 index.html 마지막
게시를 유지한다. HTTP 관찰과 worker 관찰의 최소 300초, worker 인계, 기존 요청 종료 확인,
롤백과 EC2 종료 순서는 바꾸지 않는다. 작업 실패나 취소 후 남은 업로드가 복구와 겹치지 않도록
자식 프로세스 그룹을 종료하고 회수한다. 동시 실행 중인 요청은 최대 4개까지 완료될 수 있다.

## 검증과 운영 반영

`test-frontend-transfer.sh`는 실제 Bash 자식 프로세스를 사용해 최대 동시 실행 수, index.html의
게시 순서, 형제 작업 실패와 TERM 시 회수, 잘못된 체크섬 응답, 전송 중 파일 변조,
중복 요청 제거 후 전체 공개 검사 유지, 확정 manifest의 실행 정보 불일치를 검증한다.
S3와 공개 HTTP는 대역이며 실제 AWS의 응답, IAM과 운영 장애를 증명하지는 않는다.
기존 300초 관찰, 299초 거부, CAS 충돌, 부분 게시와 복구 시험도 함께 실행한다.

로컬 전체 계약 시험은 정상 종료했고 PASS 결과 273건을 확인했다. 별도 API 예산 시나리오
12개가 통과했으며, 161개 파일의 기존 릴리스 공동 배포 성공 경로는 GitHub 요청 454회로
시험 예산 1,000회 안에서 완료됐다. 최종 변경 Bash 파일은 구문 검사와 ShellCheck의 오류/경고
수준 검사를 통과했다. 외부에서 source하는 파일과 공유 전역 변수에 대한 SC1091/SC2034는 제외했다.
실제 운영 배포와 실제 300초 관찰은 아직 이 개선 코드로 실행하지 않았다.

```bash
bash infra/blue-green-deploy/tests/actions/run-tests.sh
bash infra/blue-green-deploy/tests/actions/run-api-budget.sh
# 최근 artifact와 같은 파일 수로 성공 경로를 추가 검증한다.
bash infra/blue-green-deploy/tests/actions/deployment-api-budget-case.sh 161 success both existing
```

현재 배포 방식에서는 main 실행의 SHA에 포함된 성능 개선 코드가 같은 실행에 사용된다.
이 문서의 과거 측정은 이 코드의 운영 적용을 증명하지 않는다.
최초 방식 전환은 [SHA 배포 전환](release-sha.md), 설치형 watchdog/수집기는 서버 구성 절차를 따른다.

첫 공동 배포에서는 전체 시간과 plan/switch/seal의 시간, worker 인계에서 활성화까지의 공백,
HTTP/worker 각각 300초 관찰 완료와 최종 COMPLETE를 확인한다. 추가된
`frontend_transfer operation=... files=... concurrency=4 seconds=...` 로그로 전송 시간을 분리한다.
동시에 coordinator의 CPU, 가용 메모리와 swap 증가를 확인한다. 20분을 넘으면 이 측정으로
남은 병목을 다시 판단하며 관찰 시간이나 복구 검사를 줄여 목표를 맞추지 않는다.
