const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const classifier = path.join(__dirname, "pr-ci-scope.sh");
const checks = (backend, frontend, e2e) => `backend=${backend}\nfrontend=${frontend}\ne2e=${e2e}\n`;
const all = checks(true, true, true);
const backendOnly = checks(true, false, false);
const frontendOnly = checks(false, true, false);
const browserAndFrontend = checks(false, true, true);
const sharedFixture = checks(true, true, false);
const none = checks(false, false, false);

function repository(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jarihana-pr-ci-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "CI Test");
  git("config", "user.email", "ci@example.test");
  function commit(files) {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), "fixture");
    }
    git("add", "--all");
    git("commit", "--quiet", "-m", "fixture");
    return git("rev-parse", "HEAD");
  }
  const scope = (base, head) => execFileSync("bash", [classifier, "pull_request", base, head], { cwd, encoding: "utf8" });
  return { cwd, git, commit, scope };
}

test("PR jobs follow the app, unit-test and mocked-browser inputs", (t) => {
  const { commit, scope } = repository(t);
  let base = commit(["README.md"]);
  for (const [file, expected] of [
    ["backend/src/main/java/Room.java", backendOnly],
    ["frontend/src/pages/Room.jsx", browserAndFrontend],
    ["frontend/tests/domain/hooks.test.js", frontendOnly],
    ["frontend/tests/e2e/app.spec.js", browserAndFrontend],
    ["backend/src/main/resources/db/migration/V46__space_furniture_catalog.sql", all],
    ["backend/src/test/resources/group-space-v9-catalog.json", sharedFixture],
    ["backend/src/main/resources/rhythm-harpoon/ranked-chart.json", sharedFixture],
    ["backend/src/test/resources/rhythm-harpoon/golden-replays.json", sharedFixture],
    ["frontend/tests/fixtures/clubhouse-seeds.cjs", browserAndFrontend],
    ["realtime/src/main/resources/contracts/asset-capabilities.json", browserAndFrontend],
    ["realtime/src/main/resources/contracts/legacy-surface-anchors.json", none],
    ["contracts/realtime/v1/asset-capabilities.json", none],
    ["contracts/realtime/v1/surface-anchors.json", none],
    ["backend/src/main/resources/db/migration/V45__versioned_space_blueprints.sql", all],
    ["backend/src/main/resources/db/migration/V47__space_blueprint_runtime.sql", all],
    ["backend/src/main/resources/db/migration/V48__space_furniture_interactions.sql", all],
    ["infra/cloudfront/spa-fallback.js", frontendOnly],
    ["infra/cloudfront/group-share-preview.js", frontendOnly],
    ["frontend/docs/rhythm-double-tap-mix.json", frontendOnly],
    ["backend/docs/context/api/endpoints/group-space.md", none],
    ["frontend/docs/ui-evidence/before.png", none],
    ["frontend/src/shared/assets/landing/README.md", none],
    ["docs/release\nbackend/src/file.java", none],
    ["frontend/public/game-assets/help.md", browserAndFrontend],
    [".gitattributes", all],
    [".github/workflows/ci.yml", all],
    [".github/scripts/pr-ci-scope.sh", all],
    [".github/scripts/pr-ci-scope.test.cjs", all]
  ]) {
    const head = commit([file]);
    assert.equal(scope(base, head), expected, file);
    base = head;
  }
});

test("a PR uses its merge base and includes deleted paths and both sides of renames", (t) => {
  const { cwd, git, commit, scope } = repository(t);
  const base = commit(["backend/Room.java", "frontend/src/Page.jsx"]);
  git("switch", "--quiet", "-c", "target");
  const target = commit([".github/workflows/ci.yml"]);
  git("switch", "--quiet", "-c", "feature", base);
  const docs = commit(["docs/guide.md"]);
  assert.equal(scope(target, docs), none);

  fs.renameSync(path.join(cwd, "backend/Room.java"), path.join(cwd, "frontend/src/Room.jsx"));
  const renamed = commit([]);
  assert.equal(scope(docs, renamed), all);
  fs.unlinkSync(path.join(cwd, "frontend/src/Page.jsx"));
  assert.equal(scope(renamed, commit([])), browserAndFrontend);
});

test("manual runs verify everything and comparison failures cannot publish a skip", (t) => {
  const { cwd, commit } = repository(t);
  const base = commit(["README.md"]);
  const run = (...args) => spawnSync("bash", [classifier, ...args], { cwd, encoding: "utf8" });
  const manual = run("workflow_dispatch");
  assert.equal(manual.status, 0);
  assert.equal(manual.stdout, all);
  for (const args of [
    ["pull_request", "", base],
    ["pull_request", base, "--help"],
    ["pull_request", base, "0".repeat(40)],
    ["unknown", base, base]
  ]) {
    const result = run(...args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  }
});
