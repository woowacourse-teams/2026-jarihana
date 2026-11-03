#!/usr/bin/env bash
# Journal observations never acquire deployment locks or refresh deployment leases.
observe_journal() {
  local file=$1 digest phase
  JOURNAL=null; PHASE=-1; LEASE=-1; JOURNAL_OK=0
  if [[ ! -e "$file" && ! -L "$file" && -d "$(dirname "$file")" && -r "$(dirname "$file")" && -x "$(dirname "$file")" ]]; then
    PHASE=0; JOURNAL_OK=1; return
  fi
  [[ -f "$file" && ! -L "$file" && -r "$file" ]] || return 0
  [[ $(wc -c < "$file") -le 4194304 ]] || return 0
  JOURNAL=$(cat -- "$file") || { JOURNAL=null; return 0; }
  digest=$(bg_topology_digest)
  if ! jq -es --arg env "$ENVIRONMENT" --arg digest "$digest" --arg control "$(jq -r '.topology.control.sha' <<< "$CONFIG")" '
    def integer: type=="number" and floor==. and .>=0;
    length==1 and (.[0] |
      .schema_version==2 and .environment==$env and .topology_digest==$digest and .control_sha==$control and
      (.revision|integer) and (.run_id|integer and .>0) and .attempt==1 and
      (.sha|type=="string" and test("^[a-f0-9]{40}$")) and (.mode|IN("deploy","bootstrap")) and
      (.old|IN("A","B")) and (.target|IN("A","B")) and
      ((has("frontend_only")|not) or (.frontend_only|type=="boolean")) and
      ((has("backend_only")|not) or (.backend_only|type=="boolean")) and
      (if .frontend_only==true then
        .environment=="prod" and .mode=="deploy" and .backend_only!=true and .old==.target
       else .old!=.target end) and
      (.created_at|integer) and (.heartbeat|integer) and (.expires_at|integer) and
      .heartbeat>=.created_at and .expires_at>.created_at and
      (.phase|IN("PREPARING","HANDOFF","SWITCHING","OBSERVING","SEALED","COMPLETE","ROLLING_BACK","ROLLED_BACK","NEEDS_ATTENTION")) and
      (has("pending") and (.pending==null or (.pending|type=="object" and (.deadline|integer)))))
  ' <<< "$JOURNAL" >/dev/null 2>&1; then JOURNAL=null; return 0; fi
  JOURNAL_OK=1
  phase=$(jq -r '.phase' <<< "$JOURNAL")
  PHASE=$(jq -nr --arg p "$phase" '["idle","PREPARING","HANDOFF","SWITCHING","OBSERVING","SEALED","COMPLETE","ROLLING_BACK","ROLLED_BACK","NEEDS_ATTENTION"]|index($p)')
  LEASE=0
  if jq -e --argjson now "$BG_OBSERVABILITY_NOW" '.expires_at>$now and .created_at<=$now+5 and .heartbeat<=$now+5 and (if .pending==null then $now-.heartbeat<=60 else .pending.deadline>$now end)' <<< "$JOURNAL" >/dev/null; then LEASE=1; fi
  # Expired active journals cannot assert a current deployment stage.
  case "$phase" in COMPLETE|ROLLED_BACK|NEEDS_ATTENTION) ;; *) [[ "$LEASE" == 1 ]] || PHASE=-1;; esac
}
