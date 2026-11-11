import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useBeforeUnload, useBlocker, useLocation, useNavigate } from "react-router";
import { AVATAR_BASIC_APPEARANCE, avatarAppearanceKey } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { useAuth } from "../../features/auth/index.js";
import { AvatarFrame } from "../../features/avatar/AvatarFrame.jsx";
import { deleteMyAvatar, saveMyAvatar } from "../../features/avatar/api.js";
import { useMyAvatar } from "../../features/avatar/hooks.js";
import { Button, Modal } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";
import "./avatar.css";

function AvatarWorkspace({ initial, queryKey, memberId, onAccountChanged }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const returnAfterSave = useRef(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.appearance);
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dirty = avatarAppearanceKey(draft) !== avatarAppearanceKey(saved.appearance);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || pending) && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload((event) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ""; } });
  useEffect(() => {
    if (pending || !returnAfterSave.current) return;
    returnAfterSave.current = false;
    // Navigate after the saved baseline reaches the leave guard. Preserve edits made during the request.
    if (!dirty) void navigate("/my", { replace: true });
  }, [saved, dirty, pending, navigate]);

  async function remember(value) {
    await client.cancelQueries({ queryKey, exact: true });
    client.setQueryData(queryKey, value);
    setSaved(value);
  }
  async function save() {
    if (pending || !ready) return;
    const appearance = { ...draft };
    setPending(true); setError(""); setNotice("");
    try {
      await saveMyAvatar(appearance, memberId);
      await remember({ customized: true, appearance });
      setNotice("아바타를 저장했어요.");
      returnAfterSave.current = true;
    } catch (failure) {
      if (failure.code === "ACCOUNT_CHANGED") await onAccountChanged();
      else setError("저장하지 못했어요. 선택한 모습은 그대로예요. 연결 상태를 확인하고 다시 저장해 주세요.");
    } finally { setPending(false); }
  }
  async function remove() {
    if (pending) return;
    setPending(true); setError(""); setNotice("");
    try {
      await deleteMyAvatar(memberId);
      const value = { customized: false, appearance: { ...AVATAR_BASIC_APPEARANCE } };
      await remember(value); setDraft(value.appearance); setReady(false); setGeneration(value => value + 1);
      setDeleteOpen(false); setNotice("아바타를 삭제하고 기본 모습으로 돌아왔어요.");
    } catch (failure) {
      if (failure.code === "ACCOUNT_CHANGED") {
        setDeleteOpen(false);
        await onAccountChanged();
      } else {
        setError("삭제하지 못했어요. 저장된 아바타를 유지했어요. 다시 시도해 주세요.");
      }
    } finally { setPending(false); }
  }
  return (
    <>
      {error && !deleteOpen ? <p role="alert" className="avatar-error">{error}</p> : null}
      <div aria-busy={pending}>
        <AvatarFrame key={generation} appearance={saved.appearance} onChange={value => { setDraft(value); setNotice(""); }} onReady={() => setReady(true)} onError={() => setReady(false)} />
      </div>
      <div className="avatar-workspace-bar">
        <Link to="/my" data-ph-capture-attribute-action="avatar_back_to_my">← 마이페이지</Link>
        <span role="status">{pending ? "처리하고 있어요…" : dirty ? "아직 저장하지 않은 모습이에요." : notice || (saved.customized ? "저장된 아바타" : "기본 아바타")}</span>
        <Button data-ph-capture-attribute-action="avatar_save" disabled={!ready || (saved.customized && !dirty)} pending={pending} onClick={save}>저장하기</Button>
      </div>
      <div className="avatar-delete-area">
        <p>삭제하면 머리와 안경이 없는 기본 모습으로 돌아가요.</p>
        <Button variant="tertiary" data-ph-capture-attribute-action="avatar_delete_open" disabled={!saved.customized || pending} onClick={() => { setError(""); setDeleteOpen(true); }}>아바타 삭제</Button>
      </div>
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} dismissible={!pending} closeAction="avatar_delete_close" title="아바타를 삭제할까요?" description="저장된 파츠 조합과 편집 중인 모습이 사라지고 기본 아바타로 돌아가요.">
        {error ? <p role="alert">{error}</p> : null}
        <div className="ui-dialog__actions">
          <Button variant="secondary" data-ph-capture-attribute-action="avatar_delete_cancel" disabled={pending} onClick={() => setDeleteOpen(false)}>취소</Button>
          <Button variant="danger" data-ph-capture-attribute-action="avatar_delete_confirm" pending={pending} onClick={remove}>삭제하고 기본형으로</Button>
        </div>
      </Modal>
      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} dismissible={!pending} closeAction="avatar_leave_close" title={pending ? "저장을 처리하고 있어요" : "편집을 마치고 나갈까요?"} description={pending ? "처리가 끝난 뒤 이동해 주세요." : "저장하지 않은 변경사항은 사라져요."}>
        <div className="ui-dialog__actions">
          <Button variant="secondary" data-ph-capture-attribute-action="avatar_leave_cancel" onClick={() => blocker.reset?.()}>계속 머무르기</Button>
          <Button disabled={pending} data-ph-capture-attribute-action="avatar_leave_confirm" onClick={() => blocker.proceed?.()}>저장하지 않고 나가기</Button>
        </div>
      </Modal>
    </>
  );
}

export function AvatarPage() {
  const { member, sessionVersion, reload } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [checkingAccount, setCheckingAccount] = useState(false);
  const query = useMyAvatar({ enabled: !checkingAccount });
  // Refetches must not replace an in-progress draft; remount only on account/session changes.
  useEffect(() => { document.title = "내 아바타 · 자리하나"; }, []);

  async function reloadAccount() {
    setCheckingAccount(true);
    // Keep the notice in route state because the auth guard remounts on account change.
    await navigate("/my/avatar", { replace: true, state: { avatarAccountChanged: true } });
    await reload().catch(() => undefined);
    setCheckingAccount(false);
  }

  return (
    <div className="avatar-editor-page">
    <AccountLayout title="내 아바타">
      {state?.avatarAccountChanged ? <p role="alert">로그인 계정이 바뀌었어요. 현재 계정에서 아바타를 다시 편집해 주세요.</p> : null}
      {checkingAccount || query.isPending ? <p role="status">아바타를 불러오고 있어요.</p> : null}
      {!checkingAccount && query.isError && !query.data ? <><p role="alert">저장된 아바타를 불러오지 못했어요.</p><Button data-ph-capture-attribute-action="avatar_load_retry" onClick={() => query.refetch()}>다시 불러오기</Button></> : null}
      {!checkingAccount && member && query.data ? <AvatarWorkspace key={`${member.id}:${sessionVersion}`} initial={query.data} memberId={member.id} queryKey={["member-avatar", member.id, sessionVersion]} onAccountChanged={reloadAccount} /> : null}
    </AccountLayout>
    </div>
  );
}
