#!/usr/bin/env bash
# Reuse a verified, pinned installation on the dedicated coordinator runner.
set -euo pipefail
umask 077
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]]
[[ -d ${RUNNER_TEMP:?} && -d ${RUNNER_TOOL_CACHE:?} && -n ${GITHUB_PATH:?} ]]
cli_version=2.38.5
cli_sha=07711a936e9d271045ab937d2c2c5390c25f419e4ba9e25adb9e996031e3f6be
cli_root="$RUNNER_TOOL_CACHE/jarihana-awscli"
[[ ! -L $cli_root ]]
mkdir -p "$cli_root"
[[ $(stat -c '%u:%a' "$cli_root") == "$EUID:700" ]]
[[ ! -L $cli_root/install.lock ]]
exec 9>"$cli_root/install.lock"
flock -w 180 9
cli_cache="$cli_root/linux-aarch64-$cli_version-$cli_sha"
cli_temp=$(mktemp -d "$RUNNER_TEMP/frontend-awscli.XXXXXX")
cli_building=false
cleanup() {
  local result=$?
  trap - EXIT
  rm -rf -- "$cli_temp"
  if [[ $cli_building == true ]]; then rm -rf -- "$cli_cache"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cli_inventory() (
  cd "$cli_cache"
  LC_ALL=C find bin install -printf '%y %m %p %l\n' | LC_ALL=C sort
)
cli_hashes() (
  cd "$cli_cache"
  find bin install -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
)
cli_valid() {
  [[ -d $cli_cache && ! -L $cli_cache && -f $cli_cache/files.sha256 &&
     ! -L $cli_cache/files.sha256 && -f $cli_cache/tree.txt && ! -L $cli_cache/tree.txt &&
     $(stat -c '%u:%a' "$cli_cache") == "$EUID:700" ]] || return 1
  cli_inventory > "$cli_temp/tree.txt" || return 1
  cmp -s "$cli_cache/tree.txt" "$cli_temp/tree.txt" || return 1
  cli_hashes > "$cli_temp/files.sha256" || return 1
  cmp -s "$cli_cache/files.sha256" "$cli_temp/files.sha256" || return 1
  [[ $("$cli_cache/bin/aws" --version) == aws-cli/2.38.5\ * ]]
}

if cli_valid; then
  echo "AWS_CLI_CACHE=hit version=$cli_version"
else
  echo "AWS_CLI_CACHE=miss version=$cli_version"
  # Verify the upstream archive before running any installer or cached executable.
  curl -q --fail --silent --show-error --proto '=https' --max-redirs 0 --connect-timeout 5 --max-time 180 \
    "https://awscli.amazonaws.com/awscli-exe-linux-aarch64-$cli_version.zip" --output "$cli_temp/awscliv2.zip"
  printf '%s  %s\n' "$cli_sha" "$cli_temp/awscliv2.zip" | sha256sum --check
  unzip -q "$cli_temp/awscliv2.zip" -d "$cli_temp"
  rm -rf -- "$cli_cache"
  mkdir -m 700 "$cli_cache"
  cli_building=true
  "$cli_temp/aws/install" --install-dir "$cli_cache/install" --bin-dir "$cli_cache/bin"
  [[ $("$cli_cache/bin/aws" --version) == aws-cli/2.38.5\ * ]]
  cli_hashes > "$cli_cache/files.sha256"
  cli_inventory > "$cli_cache/tree.txt"
  cli_valid
  cli_building=false
fi
printf '%s\n' "$cli_cache/bin" >> "$GITHUB_PATH"
