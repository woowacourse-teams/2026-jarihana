#!/usr/bin/env bash
# Run once on each host from a reviewed root-owned checkout.
set -euo pipefail
[[ $(id -u) == 0 && $# == 1 && $1 =~ ^[a-z][a-z0-9_-]*$ ]]
account=$1
id "$account" >/dev/null
source_file=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host-upgrade.sh
path=$source_file
while [[ $path != / ]]; do
  [[ -e $path && ! -L $path ]]
  read -r uid mode < <(stat -c '%u %a' "$path")
  [[ $uid == 0 ]] && (( (8#$mode & 0022)==0 )) || { echo 'Installation source is not root protected' >&2; exit 1; }
  path=$(dirname "$path")
done
bash -n "$source_file"
install -o root -g root -m 0755 "$source_file" /usr/local/sbin/jarihana-control-upgrade
rule=$(mktemp /etc/sudoers.d/.jarihana-control.XXXXXX)
trap 'rm -f "$rule"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/jarihana-control-upgrade\n' "$account" >"$rule"
chmod 0440 "$rule"
visudo -cf "$rule"
mv -T "$rule" /etc/sudoers.d/jarihana-control-upgrade
