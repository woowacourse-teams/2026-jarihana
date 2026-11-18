const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const url = "https://github.com/owner/repo/actions/runs/123";
const filter = path.join(__dirname, "production-release-summary.jq");

function job(name, conclusion = "success", start = "12:00:00", end = "12:00:10") {
  return { id: 77, name: `blue-green / ${name}`, conclusion,
    started_at: `2026-11-18T${start}Z`, completed_at: `2026-11-18T${end}Z` };
}

function summary(...jobs) {
  const result = spawnSync("jq", ["-sr", "--arg", "url", url, "--arg", "attempt", "2", "-f", filter], {
    input: jobs.map((j) => JSON.stringify(j)).join("\n"), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("four stages count overlapping observations once and exclude skipped jobs and the queue guardian", () => {
  const output = summary(job("candidate-worker-observation / operation", "success", "12:00:00", "12:05:00"),
    job("api-metrics-observation / phase", "success", "12:00:05", "12:05:15"),
    job("frontend-observe", "skipped", "11:00:00", "13:00:00"),
    job("deployment-queue-guardian", "success", "11:00:00", "13:00:00"), job("deployment-result"));
  assert.deepEqual([...output.matchAll(/^\| (준비|전환|관측|마무리) \|/gm)].map((m) => m[1]),
    ["준비", "전환", "관측", "마무리"]);
  assert.match(output, /관측 \| 실행 잡 통과 \| 5분 15초/);
  assert.match(output, /\*\*배포 결과\*\* 성공/);
  assert.match(output, /\*\*복구\*\* 해당 없음/);
});

test("a completed rollback preserves the original failure and links to both jobs", () => {
  const output = summary(job("switch / phase", "failure"), job("frontend-recover / phase"),
    job("finish-rollback / phase"), job("deployment-result", "failure"));
  assert.match(output, /\*\*중단 위치\*\* 전환/);
  assert.ok(output.includes(`[switch](${url}/job/77) (실패)`));
  assert.ok(output.includes(`전체 롤백 완료. [finish-rollback](${url}/job/77)`));
  assert.match(output, /관측 \| 실행 기록 없음/);
});

test("frontend recovery is terminal only for an identified frontend-only release", () => {
  const frontend = job("frontend-recover / phase");
  assert.match(summary(job("frontend-publish / phase", "timed_out"), frontend), /프론트 전용 배포 복구 완료/);
  assert.match(summary(job("switch / phase", "failure"), frontend), /전체 복구 미확인/);
  assert.match(summary(frontend), /전체 복구 미확인/); // A partial rerun may omit the publish job.
});

test("cancel, failed rollback, and interrupt have different outcomes", () => {
  const cancelled = summary(job("frontend-build / build", "cancelled"), job("finish-rollback", "skipped"));
  assert.match(cancelled, /중단 위치\*\* 준비/);
  assert.match(cancelled, /\(취소\)/);
  assert.match(cancelled, /복구 완료 기록 없음/);
  assert.match(summary(job("resume-old / operation", "failure")), /복구 미완료.*resume-old/);
  assert.match(summary(job("interrupt / phase"), job("deployment-result", "failure")), /복구 완료 미확인.*interrupt/);
});

test("early gate failure, bootstrap, and additional job failures stay visible", () => {
  const gate = { ...job("release-enabled", "failure"), name: "release-enabled" };
  assert.match(summary(gate), /준비 \| \[release-enabled\]/);
  assert.match(summary(job("finish-bootstrap / phase"), job("deployment-result")), /마무리 \| 실행 잡 통과/);
  assert.match(summary(job("deployment-queue-guardian", "failure"), job("deployment-result")), /추가 작업\*\*.*guardian.*실패/);
});
