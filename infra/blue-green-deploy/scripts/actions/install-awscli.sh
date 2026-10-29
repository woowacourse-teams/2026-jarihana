#!/usr/bin/env bash
# Use the official pinned binary rather than the host's Python CLI installation.
set -euo pipefail
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]]
[[ -d ${RUNNER_TEMP:?} && -n ${GITHUB_PATH:?} ]]
cli_temp=$(mktemp -d "$RUNNER_TEMP/frontend-awscli.XXXXXX")
curl -q --fail --silent --show-error --proto '=https' --max-redirs 0 --connect-timeout 5 --max-time 180 \
  https://awscli.amazonaws.com/awscli-exe-linux-aarch64-2.38.5.zip --output "$cli_temp/awscliv2.zip"
# Keep the original release's exact upstream archive checksum.
echo "07711a936e9d271045ab937d2c2c5390c25f419e4ba9e25adb9e996031e3f6be  $cli_temp/awscliv2.zip" | sha256sum --check
unzip -q "$cli_temp/awscliv2.zip" -d "$cli_temp"
"$cli_temp/aws/install" --install-dir "$cli_temp/install" --bin-dir "$cli_temp/bin"
[[ $("$cli_temp/bin/aws" --version) == aws-cli/2.38.5\ * ]]
printf '%s\n' "$cli_temp/bin" >> "$GITHUB_PATH"
printf 'FE_AWSCLI_TEMP=%s\n' "$cli_temp" >> "${GITHUB_ENV:?}"
rm -rf -- "$cli_temp/aws" "$cli_temp/awscliv2.zip"
