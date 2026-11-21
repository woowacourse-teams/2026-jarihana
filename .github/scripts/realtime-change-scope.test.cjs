const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const classifier = path.resolve(__dirname, "../../infra/realtime/change-scope.sh");

test("a whole push or PR retains the strongest realtime change", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "realtime-change-scope-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const run = (command, args) => execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
  const git = (...args) => run("git", args);
  const scope = (event, base, head) => run("bash", [classifier, event, base, head]);
  function commit(file) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), "fixture");
    git("add", "--all");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "fixture");
    return git("rev-parse", "HEAD");
  }

  git("init", "--quiet");
  const base = commit("README.md");
  const ui = commit("frontend/src/pages/space/roomScene.js");
  const furniture = commit("backend/src/main/resources/db/migration/V46__space_furniture_catalog.sql");
  const migration = commit("backend/src/main/resources/db/migration/V47__space_blueprint_runtime.sql");
  const server = commit("realtime/src/main/java/Room.java");
  const frontend = commit("frontend/src/features/group-space/api.js");
  for (const event of ["pull_request", "push"]) {
    assert.equal(scope(event, base, ui), "none");
    assert.equal(scope(event, ui, furniture), "server-tests");
    assert.equal(scope(event, base, migration), "server-tests");
    assert.equal(scope(event, base, frontend), "deploy");
    assert.equal(scope(event, server, frontend), "none");
  }

  fs.renameSync(path.join(cwd, "realtime/src/main/java/Room.java"), path.join(cwd, "renamed.txt"));
  const removed = commit("release-notes.md");
  assert.equal(scope("push", frontend, removed), "deploy");
  const contract = commit("contracts/realtime/v1/asset-capabilities.json");
  assert.equal(scope("push", removed, contract), "deploy");
  assert.equal(scope("push", "0".repeat(40), contract), "deploy");
  assert.equal(scope("workflow_dispatch", "", contract), "deploy");
});
