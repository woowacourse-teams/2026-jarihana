# Manual QA: live backend public pages

Environment: frontend production Webpack preview on `http://127.0.0.1:4175`, started with Node `v24.19.0`; backend left at `127.0.0.1:8080`. The in-app browser connector was unavailable during this rerun, so the project's installed Playwright Chromium was used as the faithful browser fallback. It used the real `/api` and `/images` proxy paths; no mocks or request interception, OAuth login, or mutations were used.

## surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| LB-GROUPS-1440 | public groups list; real data; broken image/overflow/console checks | Playwright Chromium fallback, 1440x1000 | `goto http://127.0.0.1:4175/groups`; wait; inspect `.groups-grid .ui-group-card`, `document.images`, scroll widths, console/network events | PASS | A1,A2,A3,A4 |
| LB-FILTER-SEARCH | groups search interaction | In-app Browser, 1440x1000 | fill searchbox `모임 검색` with `Spring Boot`; click exact button `검색`; wait | PASS | A2,A5 |
| LB-FILTER-TYPE | groups type filter interaction | In-app Browser, 1440x1000 | `goto /groups`; click exact button `스터디`; wait; inspect URL/count/aria-pressed | PASS | A2,A5 |
| LB-DETAIL-DEEPLINK | first group navigation to detail | In-app Browser, 1440x1000 | `goto /groups`; click first `.groups-grid a` (`href=/groups/1`); wait for `http://127.0.0.1:4175/groups/1` | PASS | A2,A6 |
| LB-DETAIL-RELOAD | detail deep-link refresh | In-app Browser, 1440x1000 | reload current `/groups/1`; wait; inspect heading/error/route | PASS | A6,A7 |
| LB-GROUPS-360 | responsive public groups list | In-app Browser, 360x1000 | set viewport; `goto /groups`; scroll document bottom to complete lazy images; return top; capture | PASS | A8,A9 |
| LB-DETAIL-360 | responsive group detail | In-app Browser, 360x1000 | set viewport; `goto /groups/1`; wait; inspect heading/overflow/errors; capture | PASS | A8,A10 |
| LB-PROXY | real HTTP proxy responses | HTTP via preview | `curl -i http://127.0.0.1:4175/api/groups?size=12`; `curl -i http://127.0.0.1:4175/images/default-group.png` | PASS | A11 |

## adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV-EMPTY-SEARCH | search robustness | no-result query | unusual query returns zero cards and the explicit empty state, without an error state | PASS | A5,A12 |
| ADV-MOBILE-OVERFLOW | responsive behavior | narrow 360px viewport | public list and detail remain within viewport with `document/body.scrollWidth = 360` | PASS | A8,A9,A10 |
| ADV-BROKEN-IMAGES | media/proxy integrity | image load failure check | all observed group images have positive natural dimensions; `/images/default-group.png` returns 200 PNG | PASS | A3,A8,A11 |
| ADV-DEEPLINK-REFRESH | routing resilience | direct deep-link reload | `/groups/1` remains the route and renders group heading after reload | PASS | A6,A7 |
| ADV-CONSOLE-NETWORK | runtime integrity | browser error/failed-request observation | zero console error entries and no unexpected failed network observed; expected auth bootstrap 401 and Webpack size warnings are documented | PASS | A2,A6,A7,A13 |

## artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | screenshot | groups list, clean 1440x1000 viewport | [.omo/evidence/visual-qa/live-backend/groups-1440-clean.png](visual-qa/live-backend/groups-1440-clean.png) |
| A2 | action log | browser surface, exact invocations and observed states | [.omo/evidence/visual-qa/live-backend/browser-actions.log](visual-qa/live-backend/browser-actions.log) |
| A3 | JSON metrics | groups desktop DOM/image/overflow metrics | [.omo/evidence/visual-qa/live-backend/groups-1440-metrics.json](visual-qa/live-backend/groups-1440-metrics.json) |
| A4 | HTTP log | production preview build log and loopback URL | [.omo/evidence/live-backend-qa.md](live-backend-qa.md) |
| A5 | action result | search and type-filter observations | [.omo/evidence/visual-qa/live-backend/browser-actions.log](visual-qa/live-backend/browser-actions.log) |
| A6 | screenshot | group detail, clean 1440x1000 viewport | [.omo/evidence/visual-qa/live-backend/group-detail-1440-clean.png](visual-qa/live-backend/group-detail-1440-clean.png) |
| A7 | JSON metrics | detail deep-link reload metrics | [.omo/evidence/visual-qa/live-backend/group-detail-reload-metrics.json](visual-qa/live-backend/group-detail-reload-metrics.json) |
| A8 | capture integrity | signatures, dimensions, non-empty bytes, fresh mtimes | [.omo/evidence/visual-qa/live-backend/capture-integrity.txt](visual-qa/live-backend/capture-integrity.txt) |
| A9 | screenshot/JSON | groups list, clean 360x1000 viewport, and metrics | [.omo/evidence/visual-qa/live-backend/groups-360-clean.png](visual-qa/live-backend/groups-360-clean.png), [.omo/evidence/visual-qa/live-backend/groups-360-metrics.json](visual-qa/live-backend/groups-360-metrics.json) |
| A10 | screenshot/JSON | group detail, clean 360x1000 viewport, and metrics | [.omo/evidence/visual-qa/live-backend/group-detail-360-clean.png](visual-qa/live-backend/group-detail-360-clean.png), [.omo/evidence/visual-qa/live-backend/group-detail-360-metrics.json](visual-qa/live-backend/group-detail-360-metrics.json) |
| A11 | HTTP evidence | `/api` and `/images` proxy status/content type/size/signature | [.omo/evidence/visual-qa/live-backend/proxy-http-check.txt](visual-qa/live-backend/proxy-http-check.txt) |
| A12 | action result | no-result search state | [.omo/evidence/visual-qa/live-backend/browser-actions.log](visual-qa/live-backend/browser-actions.log) |
| A13 | runtime observation | no console errors; expected auth bootstrap 401s; warning-only build diagnostics | [.omo/evidence/visual-qa/live-backend/browser-actions.log](visual-qa/live-backend/browser-actions.log) |

Overall verdict: PASS. No product or backend files were modified.
