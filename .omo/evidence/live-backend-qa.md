# Live backend browser QA

Date: 2026-08-21 (Asia/Seoul)

## Runtime

- Surface: production Webpack preview at `http://127.0.0.1:4175`; current rerun used the installed Playwright Chromium fallback because the in-app browser connector was unavailable.
- Preview runtime: Node `v24.19.0`; backend was the existing Java listener on `127.0.0.1:8080`.
- Proxy: `/api` and `/images` requests were made through the preview; no mock or intercept layer was used.
- OAuth/login and all mutations were intentionally not invoked because no real OAuth credentials were available.
- The browser's normal auth bootstrap emitted expected unauthenticated `GET /api/members/me` and `POST /api/auth/refresh` 401 responses. These were not treated as unexpected failures; the requested public `/api/groups`, `/api/groups/1`, and `/images/default-group.png` calls were 200.

## Observed results

| surface | viewport | route | response status | visible count/content | overflow | console | network |
|---|---:|---|---:|---|---|---|---|
| Groups initial | 1440x1000 | `/groups` | `/api/groups?size=12` = 200 | 8 cards, groups 01–08 | 0 (`document/body=1440`) | 0 errors | `/images/default-group.png` rendered; proxy 200 PNG; expected auth bootstrap 401 only |
| Search | 1440x1000 | `/groups?keyword=Spring+Boot` | 200 | 1 card, group 06 | 0 | 0 errors | expected GET refresh only |
| Type filter | 1440x1000 | `/groups?type=STUDY` | 200 | 4 cards, groups 05–08; `스터디` pressed | 0 | 0 errors | expected GET refresh only |
| Empty search | 1440x1000 | `/groups?keyword=___qa-no-match___` | 200 | 0 cards; empty state visible | 0 | 0 errors | expected GET returned no items |
| Group detail | 1440x1000 | `/groups/1` | `/api/groups/1` = 200 | heading `로컬 테스트 그룹 01`; recruitment summary visible | 0 (`document/body=1440`) | 0 errors | no unexpected failed request; expected auth bootstrap 401 only |
| Group detail reload | 1440x1000 | `/groups/1` after reload | `/api/groups/1` = 200 | heading persisted; no error state | 0 | 0 errors | deep link survived refresh; expected auth bootstrap 401 only |
| Groups responsive | 360x1000 | `/groups` | 200 | 8 cards | 0 (`document/body=360`) | 0 errors | all 8 images complete with positive dimensions after scroll |
| Detail responsive | 360x1000 | `/groups/1` | `/api/groups/1` = 200 | heading persisted | 0 (`document/body=360`) | 0 errors | no unexpected failed request; expected auth bootstrap 401 only |

## Proxy checks

The preview proxy returned `200 application/json`, 3288 bytes, and 8 items for `/api/groups?size=12`; `/api/groups/1` returned `200 application/json`, 676 bytes, and group id 1. The image proxy returned `200 image/png`, 17761 bytes; the payload signature was PNG, 335x293, RGBA. No cookie values or sensitive headers are recorded. Full output: [proxy-http-check.txt](visual-qa/live-backend/proxy-http-check.txt).

## Captures

- [groups-1440-clean.png](visual-qa/live-backend/groups-1440-clean.png)
- [groups-360-clean.png](visual-qa/live-backend/groups-360-clean.png)
- [group-detail-1440-clean.png](visual-qa/live-backend/group-detail-1440-clean.png)
- [group-detail-360-clean.png](visual-qa/live-backend/group-detail-360-clean.png)

Capture integrity: all four files are non-empty PNGs, widths are 1440/360 as requested, and their mtime is newer than the latest observed `frontend/src` mtime. Details: [capture-integrity.txt](visual-qa/live-backend/capture-integrity.txt).

Full manual QA matrix: [live-backend-manual-qa.md](live-backend-manual-qa.md).
