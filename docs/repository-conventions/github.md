# GitHub 작업 컨벤션

## GitHub 작업 도구

GitHub 이슈·PR·리뷰·Actions·저장소 조회 및 변경 작업은 `gh` CLI를 기본 도구로 사용한다. 브라우저를 먼저 열거나 Computer Use를 기본 경로로 선택하지 않는다. `gh` CLI에 전용 명령이 없는 작업은 `gh api`로 수행할 수 있는지 먼저 확인한다.

작업을 시작하기 전에 현재 인증과 저장소 권한을 확인한다.

```bash
gh auth status
gh repo view --json nameWithOwner,viewerPermission
```

대표적인 작업은 다음 명령을 사용한다.

```bash
gh issue list
gh issue view <issue-number>
gh issue create
gh pr list
gh pr view <pr-number>
gh pr create
gh run list
gh run view <run-id>
```

Computer Use는 현재 작업자 계정이 GitHub 인증 또는 해당 저장소 작업에 필요한 권한을 보유하지 않아 `gh` CLI 작업이 권한 오류로 불가능한 경우에만 예외적으로 사용한다. 이때에도 먼저 `gh auth status`와 저장소 권한 확인 결과를 남기고, 브라우저에서 작업할 권한이 있는지 확인한다.

다음 상황에서는 Computer Use로 전환하지 않는다.

- 명령어 사용법을 모르는 경우: `gh <command> --help`로 확인한다.
- `gh` CLI 전용 명령이 없는 경우: `gh api`로 GitHub API 호출 가능 여부를 확인한다.
- 일시적인 네트워크·셸·입력 오류인 경우: 원인을 확인하고 CLI 명령을 수정해 재시도한다.

이 원칙은 [#268](https://github.com/woowacourse-teams/2026-jarihana/issues/268)에서 제기된 작업 방식 개선을 따른다.

## 이슈 컨벤션

작업 요청은 목적에 맞는 이슈 템플릿을 사용한다.

- [버그·계약 불일치](../../.github/ISSUE_TEMPLATE/bug-contract.md)
- [기능·개선 요청](../../.github/ISSUE_TEMPLATE/feature-improvement.md)
- [문서·구조 개선](../../.github/ISSUE_TEMPLATE/documentation-structure.md)

## 이슈·PR 제목 컨벤션

이슈와 PR 제목은 `{type}: {title}` 형식으로 작성한다. `{type}`은 [커밋 컨벤션](commits.md)에 정의된 타입 중
작업의 주된 목적에 맞는 값을 사용하며, 제목에는 scope를 붙이지 않는다.

```text
docs: ADR 문서 체계를 정리한다
```
