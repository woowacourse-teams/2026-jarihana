# The API includes both "blue-green / switch / phase" and "blue-green / switch"
# (a skipped reusable workflow). Classify both by their caller job name.
def job_key: (.name | split(" / ")) as $path |
  if $path[0] == "blue-green" then ($path[1] // "blue-green") else $path[0] end;

def stages: [
  {name: "준비", jobs: ["release-enabled", "resolve", "frontend-build", "plan", "prepare", "bootstrap"]},
  {name: "전환", jobs: ["grant-handoff", "handoff", "switch", "activate", "frontend-publish"]},
  {name: "관측", jobs: ["grant-observe", "candidate-worker-observation", "api-metrics-observation", "frontend-observe"]},
  {name: "마무리", jobs: ["seal", "complete-target", "grant-stop", "stop-old", "stop-ec2", "frontend-seal", "finish-bootstrap"]}
];
def recovery_jobs: ["rollback-http", "frontend-recover", "release-candidate", "grant-rollback-old", "resume-old", "finish-rollback"];
def matching($keys): map(select(.key as $key | $keys | index($key)));
def ran: map(select(.conclusion != "skipped"));
def issues: map(select(.conclusion != "success"));
def passed($key): any(.[]; .key == $key and .conclusion == "success");
def link: "[\(.key | gsub("[^A-Za-z0-9_-]"; "_"))](\($url)/job/\(.id))";
def state: {failure:"실패", timed_out:"시간 초과", cancelled:"취소", action_required:"조치 필요",
            startup_failure:"시작 실패", stale:"만료"}[.conclusion // ""] // "결과 미확인";
def issue_links: map("\(link) (\(state))") | join(", ");

def elapsed:
  if length == 0 or any(.[]; .started_at == null or .completed_at == null) then "—"
  else (map(.completed_at | fromdateiso8601) | max) - (map(.started_at | fromdateiso8601) | min) |
    if . < 0 then "—" else "\((. / 60) | floor)분 \(. % 60)초" end
  end;

def stage_row($stage):
  matching($stage.jobs) | ran |
  (if length == 0 then "실행 기록 없음"
   elif (issues | length) > 0 then (issues | issue_links)
   else "실행 잡 통과" end) as $result |
  "| \($stage.name) | \($result) | \(elapsed) |";

def recovery:
  (matching(recovery_jobs) | ran) as $recovery |
  if ($recovery | issues | length) > 0 then "복구 미완료. " + ($recovery | issues | issue_links)
  elif passed("finish-rollback") then "전체 롤백 완료. " + (matching(["finish-rollback"])[0] | link)
  elif passed("frontend-recover") and (matching(["frontend-publish"]) | ran | length) > 0 then
    "프론트 전용 배포 복구 완료. " + (matching(["frontend-recover"])[0] | link)
  elif ($recovery | length) > 0 then "일부 복구 잡 실행. 전체 복구 미확인. " + ($recovery | map(link) | join(", "))
  elif (matching(["interrupt"]) | ran | length) > 0 then "복구 완료 미확인. 중단 처리 기록 확인. " + (matching(["interrupt"])[0] | link)
  elif passed("deployment-result") then "해당 없음"
  else "복구 완료 기록 없음" end;

map(. + {key: job_key}) | map(select(.key != "release-summary")) |
if length == 0 then error("no deployment job records") else . end |
. as $jobs |
[stages[] as $stage | $jobs | matching($stage.jobs) | ran | issues | select(length > 0) |
  $stage.name] as $stops |
(matching(["deployment-result"]) | ran) as $final |
# The guardian overlaps the entire rollout. Recovery and final verdict are also
# reported separately so their runtime is not attributed to a rollout stage.
((stages | map(.jobs) | add) + recovery_jobs + ["deployment-result"]) as $classified |
(map(select(.key as $key | $classified | index($key) | not)) | ran | issues) as $other_issues |
"## 운영 배포 요약",
"",
(if ($stops | length) > 0 then "**중단 위치** " + ($stops | join(" / "))
 elif ($final | issues | length) > 0 then "**중단 위치** 최종 판정에서 확인 필요. " + ($final | issues | issue_links)
 elif ($other_issues | length) > 0 then "**중단 위치** 추가 작업 기록 확인"
 elif passed("deployment-result") then "**배포 결과** 성공"
 else "**배포 결과** 최종 판정 기록 없음" end),
(if ($other_issues | length) > 0 then "", "**추가 작업** " + ($other_issues | issue_links) else empty end),
"",
"**복구** \(recovery)",
"",
"| 단계 | 실행 결과 | 경과 시간 |",
"| --- | --- | ---: |",
(stages[] as $stage | $jobs | stage_row($stage)),
"",
"이번 시도에 실행된 잡만 표시합니다. 경과 시간은 단계의 첫 잡 시작부터 마지막 잡 종료까지입니다. 동시에 실행된 API와 워커 관측 시간은 한 번만 셉니다.",
"[원본 실행 기록 (시도 \($attempt))](\($url)/attempts/\($attempt))"
