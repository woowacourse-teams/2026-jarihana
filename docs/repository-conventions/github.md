# GitHub 작업 컨벤션

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
