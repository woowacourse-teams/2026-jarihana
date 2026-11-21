const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const runtime = path.join(root, "infra/realtime");
const repository = "ghcr.io/woowacourse-teams/jarihana-realtime";
const digest = `sha256:${"a".repeat(64)}`;
const oldImage = `${repository}@sha256:${"b".repeat(64)}`;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "realtime-deploy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runScript(script, args, env, cwd = root) {
  const result = spawnSync("bash", [path.join(runtime, script), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  assert.ifError(result.error);
  return result;
}

function passes(result) {
  assert.equal(result.status, 0, result.stderr);
}

test("resume resolves only the latest published digest and its original configuration revision on develop", (t) => {
  const dir = fixture(t);
  const state = path.join(dir, "state");
  const env = {
    GITHUB_REF: "refs/heads/develop",
    GITHUB_OUTPUT: path.join(dir, "outputs"),
    GITHUB_STEP_SUMMARY: path.join(dir, "summary"),
  };
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  function commit(file, content) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
    git("add", file);
    git("commit", "--quiet", "-m", file);
    return git("rev-parse", "HEAD");
  }
  commit("infra/realtime/check-candidate-revision.sh", fs.readFileSync(path.join(runtime, "check-candidate-revision.sh")));
  const revision = commit("infra/realtime/change-scope.sh", fs.readFileSync(path.join(runtime, "change-scope.sh")));
  const published = { GITHUB_EVENT_NAME: "push", GITHUB_SHA: revision, PUBLISHED_DIGEST: digest };
  const resume = { GITHUB_EVENT_NAME: "workflow_dispatch", RESUME_DIGEST: digest };
  const select = (vars) => runScript("select-candidate.sh", [state], { ...env, ...vars }, dir);
  assert.notEqual(select(resume).status, 0);
  passes(select(published));
  const record = fs.readFileSync(path.join(state, "latest-candidate"), "utf8");
  assert.equal(record, `${revision} ${digest}\n`);
  const head = commit("release-notes.md", "Production migration is ready");
  passes(select({ ...resume, GITHUB_SHA: head }));
  assert.ok(fs.readFileSync(env.GITHUB_OUTPUT, "utf8").endsWith(`revision=${revision}\ndigest=${digest}\n`));
  for (const invalid of [
    { ...resume, RESUME_DIGEST: "sha256:anything-else" },
    { ...resume, PUBLISHED_DIGEST: digest },
    { ...resume, GITHUB_REF: "refs/heads/feature" },
    { ...resume, GITHUB_EVENT_NAME: "pull_request" },
  ]) assert.notEqual(select(invalid).status, 0);

  const replacement = commit("infra/realtime/compose.yaml", "services: {}");
  assert.notEqual(select(resume).status, 0);
  const newerDigest = `sha256:${"c".repeat(64)}`;
  passes(select({ ...published, GITHUB_SHA: replacement, PUBLISHED_DIGEST: newerDigest }));
  assert.notEqual(select(resume).status, 0);
  assert.notEqual(select(published).status, 0);
  assert.equal(fs.readFileSync(path.join(state, "latest-candidate"), "utf8"), `${replacement} ${newerDigest}\n`);
});

test("a failed two-environment probe leaves the old deployment live; a fresh dispatch reuses the same image", (t) => {
  const dir = fixture(t);
  const bin = path.join(dir, "bin");
  const state = path.join(dir, "state");
  const source = path.join(dir, "source");
  const handoff = path.join(dir, "handoff");
  const live = path.join(dir, "live");
  const log = path.join(dir, "commands");
  for (const folder of [bin, state, source]) fs.mkdirSync(folder);
  const oldConfig = path.join(state, "old-config");
  fs.mkdirSync(oldConfig);
  fs.writeFileSync(path.join(source, "compose.yaml"), "services: {}");
  fs.writeFileSync(path.join(source, "config.alloy"), "test");
  fs.writeFileSync(path.join(oldConfig, "compose.yaml"), "services: {}");
  const record = path.join(state, "last-success");
  const previous = `${oldConfig}\n${oldImage}\n`;
  fs.writeFileSync(record, previous);
  fs.writeFileSync(live, oldImage);
  // The actual deploy script fetches this private fixture remote after its DB check.
  const checkout = path.join(dir, "checkout");
  const remote = path.join(dir, "origin.git");
  const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8" }).trim();
  fs.mkdirSync(checkout);
  git("init", "--quiet", "-b", "develop");
  git("init", "--quiet", "--bare", remote);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.mkdirSync(path.join(checkout, "infra/realtime"), { recursive: true });
  for (const file of ["check-candidate-revision.sh", "change-scope.sh"]) {
    fs.copyFileSync(path.join(runtime, file), path.join(checkout, "infra/realtime", file));
  }
  git("add", ".");
  git("commit", "--quiet", "-m", "candidate");
  const revision = git("rev-parse", "HEAD");
  git("remote", "add", "origin", remote);
  git("push", "--quiet", "origin", "develop");
  fs.writeFileSync(path.join(checkout, "release-notes.md"), "An unrelated release");
  git("add", ".");
  git("commit", "--quiet", "-m", "documentation");
  const compatible = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(checkout, "infra/realtime/compose.yaml"), "services: {}");
  git("add", ".");
  git("commit", "--quiet", "-m", "a newer server");
  const newer = git("rev-parse", "HEAD");
  git("push", "--quiet", "origin", "HEAD:refs/heads/other");
  git("checkout", "--quiet", "--detach", revision);
  fs.writeFileSync(path.join(state, "latest-candidate"), `${revision} ${digest}\n`);
  const env = {
    GITHUB_ACTOR: "test",
    GITHUB_SERVER_URL: `file://${dir}`,
    GITHUB_REPOSITORY: "origin",
    TEST_REMOTE: remote,
    GITHUB_RUN_ID: "100",
    GITHUB_RUN_ATTEMPT: "1",
    GHCR_TOKEN: "fixture",
    MONITORING_BIND_ADDRESS: "127.0.0.1",
    RUNNER_TEMP: dir,
    REALTIME_HANDOFF_ROOT: handoff,
    REALTIME_IMAGE: `${repository}@${digest}`,
    CANDIDATE_REVISION: revision,
    TEST_COMMANDS: log,
    TEST_LIVE: live,
    TEST_REVISION: revision,
    TEST_DB_DEV: "ready",
    TEST_DB_PROD: "ready",
    PATH: `${bin}:${process.env.PATH}`,
  };
  function executable(name, body) {
    fs.writeFileSync(path.join(bin, name), "#!/usr/bin/env bash\nset -eu\n" + body, { mode: 0o755 });
  }
  executable("docker", `
echo "$REALTIME_IMAGE $*" >> "$TEST_COMMANDS"
if [[ "$1" == login ]]; then exit 0; fi
if [[ "$1 $2" == "image inspect" ]]; then echo "$TEST_REVISION"; exit 0; fi
[[ "$1" == compose ]]
shift
[[ "$1 $2" == "--project-name jarihana-realtime" && "$3 $4" == "--env-file /dev/null" && "$5" == --file ]]
shift 6
case "$1" in
  config|pull) ;;
  run)
    [[ "$*" == "run --rm --no-deps -T realtime --check-runtime --server.port=0" ]]
    # Assert the candidate received both environments prepared in this run.
    [[ "$REALTIME_DEV_DB_USERNAME" == "dev-$GITHUB_RUN_ID" && "$REALTIME_PROD_DB_USERNAME" == "prod-$GITHUB_RUN_ID" ]] || exit 1
    [[ "$TEST_DB_DEV" == ready && "$TEST_DB_PROD" == ready ]] || exit 1
    if [[ -n "${"$"}{TEST_DURING_PROBE:-}" ]]; then
      git --git-dir="$TEST_REMOTE" update-ref refs/heads/develop "$TEST_DURING_PROBE"
    fi ;;
  up) printf '%s' "$REALTIME_IMAGE" > "$TEST_LIVE" ;;
  *) exit 2 ;;
esac`);
  executable("curl", `echo "curl ${"$"}{*: -1}" >> "$TEST_COMMANDS"
[[ "$(cat "$TEST_LIVE")" != "${"$"}{TEST_UNHEALTHY_IMAGE:-}" ]]`);
  executable("sleep", "exit 0");

  function prepare(target) {
    passes(runScript("prepare-settings.sh", [], {
      ...env,
      TARGET: target,
      RDS_URL: `${target}.db.test`,
      DB_USERNAME: `${target}-${env.GITHUB_RUN_ID}`,
      DB_PASSWORD: "local-fixture-only",
      ACCESS_TOKEN_SECRET: "x".repeat(32),
      FRONTEND_ORIGIN: `https://${target}.example.test`,
    }));
  }
  const deploy = (args) => runScript("deploy-candidate.sh", [source, state], { ...env, ...args }, checkout);
  const oldServerStillLive = () => {
    assert.equal(fs.readFileSync(record, "utf8"), previous);
    assert.equal(fs.readFileSync(live, "utf8"), oldImage);
    assert.doesNotMatch(fs.readFileSync(log, "utf8"), / up | down | stop | rm /);
  };

  prepare("dev");
  // The prod environment may wait for approval for hours after the dev settings were written.
  const activeHandoff = path.join(handoff, "100-1");
  const expiredHandoff = path.join(handoff, "99-1");
  fs.mkdirSync(expiredHandoff);
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(activeHandoff, old, old);
  fs.utimesSync(expiredHandoff, old, old);
  prepare("prod");
  assert.ok(fs.existsSync(path.join(activeHandoff, "dev")));
  assert.ok(!fs.existsSync(expiredHandoff));
  for (const problem of [{ TEST_DB_PROD: "old" }, { TEST_DB_DEV: "denied" }]) {
    const result = deploy(problem);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Keeping the current deployment.*resume_digest=sha256/);
    oldServerStillLive();
  }
  const wrongRevision = deploy({ TEST_REVISION: "2".repeat(40) });
  assert.match(wrongRevision.stderr, /Image revision differs/);
  oldServerStillLive();

  // The previous workflow always removes its run/attempt-specific secret handoff.
  fs.rmSync(path.join(handoff, "100-1"), { recursive: true });
  env.GITHUB_RUN_ATTEMPT = "2";
  assert.match(deploy().stderr, /Missing dev realtime settings/);
  env.GITHUB_RUN_ID = "101";
  env.GITHUB_RUN_ATTEMPT = "1";
  prepare("dev");
  assert.match(deploy().stderr, /Missing prod realtime settings/);
  oldServerStillLive();
  prepare("prod");

  const unreachable = deploy({ GITHUB_REPOSITORY: "unavailable" });
  assert.notEqual(unreachable.status, 0);
  oldServerStillLive();
  const superseded = deploy({ TEST_DURING_PROBE: newer });
  assert.notEqual(superseded.status, 0);
  assert.match(superseded.stderr, /Develop contains newer realtime deployment changes/);
  oldServerStillLive();
  // The test remote now represents an unrelated develop advance since the candidate build.
  git("--git-dir=" + remote, "update-ref", "refs/heads/develop", compatible);
  assert.ok(!fs.readFileSync(path.join(checkout, ".git/config"), "utf8").includes("AUTHORIZATION"));

  // If the candidate fails after replacement the historical config without Alloy uses /actuator/health.
  const failedHealth = deploy({ TEST_UNHEALTHY_IMAGE: env.REALTIME_IMAGE });
  assert.notEqual(failedHealth.status, 0);
  assert.match(failedHealth.stderr, /Restored the last successful/);
  assert.equal(fs.readFileSync(record, "utf8"), previous);
  assert.equal(fs.readFileSync(live, "utf8"), oldImage);
  assert.match(fs.readFileSync(log, "utf8"), /curl http:\/\/127\.0\.0\.1:8080\/actuator\/health/);

  fs.truncateSync(log, 0);
  passes(deploy());
  const commands = fs.readFileSync(log, "utf8").trim().split("\n");
  const probe = commands.findIndex((line) => line.includes(" run --rm --no-deps"));
  const up = commands.findIndex((line) => line.includes(" up -d --no-build --pull never"));
  assert.ok(probe >= 0 && up > probe);
  assert.equal(fs.readFileSync(live, "utf8"), env.REALTIME_IMAGE);
  assert.ok(fs.readFileSync(record, "utf8").endsWith(`\n${env.REALTIME_IMAGE}\n`));
});
