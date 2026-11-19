# 재사용 워크플로를 호출한 잡 이름과 실행 스텝을 함께 사용한다.
def section($job; $step):
  if $job|IN("배포 대상 확인","프론트 빌드","배포 계획","기존 앱 초기 등록") then "준비"
  elif $job=="전환과 관측" then
    if $step|contains("5분") then "관측"
    elif $step|test("확정|종료 허가") then "마무리" else "전환" end
  elif $job|IN("기존 앱 작업","새 앱 작업") then
    if $step|contains("5분") then "관측"
    elif $step|test("종료 허가|완료 기록") then "마무리"
    elif $step|test("반납|활성화") then "전환" else "준비" end
  elif $job|IN("이전 서버 종료 확인","초기 등록 확정") then "마무리"
  else null end;
def spans:
  [.[] as $j | ($j.steps // [])[] | select(.conclusion!="skipped" and .started_at and .completed_at) |
    select((.name|test("^(Set up job|Complete job|Post )"))|not) |
    {stage:section($j.key;.name),start:(.started_at|fromdateiso8601),end:(.completed_at|fromdateiso8601)}];
def elapsed: if length==0 then "—" else
  ((map(.end)|max)-(map(.start)|min)) | "\((./60)|floor)분 \(.%60)초" end;
def passed($name): any(.[]; .key==$name and .conclusion=="success");
def link($job): "[\($job.key)](\($url)/job/\($job.id))";
map(. + {key:([.name|split(" / ")[] | select(IN("배포 대상 확인","프론트 빌드","배포 계획","기존 앱 초기 등록","초기 등록 확정","기존 앱 작업","새 앱 작업","전환과 관측","이전 서버 종료 확인","배포 결과","프론트 버전 복구","전체 복구 확정","러너 대기 감시","이전 API 경로 복구","새 워커 권한 반납","이전 워커 재개 허가","이전 워커 재개","중단 상태 보존"))]|first)}) |
map(select(.key!=null)) as $jobs |
if ($jobs|length)==0 then error("배포 실행 기록 없음") else . end |
"## 운영 배포 결과",
(if env.CLEANUP_DEFERRED=="true" then "종료 보류. 새 서비스와 두 EC2를 유지합니다."
 elif ($jobs|passed("배포 결과")) and ($jobs|passed("러너 대기 감시")) then "배포 성공" else "배포 실패 또는 확인 필요" end),
(if $jobs|passed("전체 복구 확정") then "복구 결과: 전체 롤백 완료"
 elif ($jobs|passed("프론트 버전 복구")) and any($jobs[]; .key=="전환과 관측" and any(.steps[]?; .name=="프론트 전용 릴리스 게시" and (.conclusion|IN("success","failure")))) then "복구 결과: 프론트 전용 복구 완료"
 elif $jobs|passed("배포 결과") then "복구 해당 없음"
 else "전체 복구 완료 기록 없음" end),
($jobs[] | select(.conclusion!=null and (.conclusion|IN("success","skipped")|not)) |
 . as $j | ([.steps[]? | select(.conclusion!=null and (.conclusion|IN("success","skipped")|not)) | .name]|join(", ")) as $steps |
 "- \(link($j)) / \(if $steps=="" then $j.conclusion else $steps end)"),
"", "| 단계 | 경과 시간 |","| --- | --- |",
(($jobs|spans) as $spans | ["준비","전환","관측","마무리"][] as $stage |
 "| \($stage) | \($spans|map(select(.stage==$stage))|elapsed) |"),
"", "경과 시간은 해당 단계의 첫 스텝 시작부터 마지막 스텝 종료까지입니다. 허가 대기가 포함되며 병렬 구간은 서로 겹칠 수 있습니다."
