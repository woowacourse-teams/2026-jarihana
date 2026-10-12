# GitHub Actions runner 선택

배포와 서버 관리 작업은 대상 서버의 전용 라벨을 지정한다. 기본 라벨인
`self-hosted`, `Linux`, `ARM64`만 사용하면 모니터링 서버에도 작업이 배정될 수 있다.

| runner 이름 | 전용 라벨 | 담당 작업 |
| --- | --- | --- |
| `wooteco-ec2-jarihana-runner` | `jarihana-legacy` | 기존 운영 백엔드 배포, 개발·운영 프론트엔드 S3 배포, 기존 EC2의 CloudWatch 관리·알람·DB drill |
| `jarihana-dev` | `jarihana-dev` | 개발 백엔드 배포 |
| `jarihana-prod` | `jarihana-prod` | 새 운영 EC2용. 기존 운영 배포를 이 라벨로 바꾸는 작업은 별도 이관이다. |
| `jarihana-monitoring` | `jarihana-monitoring` | 모니터링 서버 전용 |

`jarihana-legacy`는 `wooteco-ec2-jarihana-runner`에만 부여한다. GitHub 저장소
Settings → Actions → Runners에서 이 runner를 선택해 라벨을 추가할 수 있다.
runner 이름과 라벨은 별개이므로 `runs-on`에는 실제 등록된 라벨을 사용한다.

기존 EC2를 쓰는 작업은 `[self-hosted, Linux, ARM64, jarihana-legacy]`를 모두
요구한다. 전용 라벨이 없거나 runner가 오프라인이면 작업은 대기하며, 모니터링
runner로 넘어가지 않는다. CI, 개발 백엔드 이미지 빌드와 프론트엔드 빌드는
GitHub 호스팅 runner를 쓴다. 기존 운영 백엔드 이미지는 기존 EC2에서 빌드한다.

새 runner는 등록할 때 `--no-default-labels --labels <전용 라벨>`을 사용하고,
워크플로에서도 해당 라벨을 지정한다. 모니터링 runner를 재등록한다면
`--no-default-labels --labels jarihana-monitoring`을 사용한다.

변경을 `develop`에 병합한 뒤 `Frontend Development Deploy`가 기존 EC2에서
성공하는지 확인한다. 운영 배포의 격리는 이 변경이 `main`에도 반영된 뒤 적용된다.
이전 커밋의 실행을 재시도하면 그 커밋의 runner 선택 조건을 사용하므로 새 실행으로 확인한다.

관련 이슈: [#376](https://github.com/woowacourse-teams/2026-jarihana/issues/376)
