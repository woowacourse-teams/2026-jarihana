import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Search, UserPlus, X } from "lucide-react";

import { getSafeNextCursor, mergeCursorPages } from "../../entities/cursor";
import { useAuth } from "../auth";
import { Button, ConfirmDialog, Modal, TextField, useToast } from "../../shared/ui";
import {
  createInvitation,
  fetchInvitation,
  fetchInvitationCandidates,
  fetchIssuedInvitations,
  revokeInvitation,
  sharedInvitationUrl
} from "./api";
import "./invitation-controls.css";

const PAGE_SIZE = 20;
const INVITATION_QUERY_ROOT = ["invitations"];

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_byte, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function roleLabel(type) {
  if (type === "COACH") return "코치";
  if (type === "CREW") return "크루";
  return "회원";
}

function courseLabel(course) {
  return ({ ANDROID: "안드로이드", BACKEND: "백엔드", FRONTEND: "프론트엔드" })[course] ?? "";
}

function statusLabel(status) {
  return ({
    ACCEPTED: "수락됨",
    CANCELED: "취소됨",
    EXPIRED: "만료됨",
    GROUP_ENDED: "모임 종료",
    PENDING: "응답 대기",
    REJECTED: "거절됨",
    VALID: "사용 가능"
  })[status] ?? status ?? "상태 확인 필요";
}

function candidateErrorMessage(error) {
  if (error?.status === 401) return "로그인이 만료됐어요. 로그인 후 다시 시도해 주세요.";
  if (error?.status === 403) return "이 모임의 구성원만 회원을 초대할 수 있어요.";
  if (error?.code === "GROUP_ENDED") return "종료된 모임에는 초대를 보낼 수 없어요.";
  return "회원 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

function targetErrorMessage(error) {
  if (error?.code === "GROUP_MEMBER_ALREADY_EXISTS") return "이미 이 모임의 참여자예요. 선택을 해제할 수 있어요.";
  if (error?.status === 401) return "로그인이 만료됐어요. 로그인 후 다시 시도해 주세요.";
  if (error?.status === 403) return "이 모임의 구성원만 초대를 보낼 수 있어요.";
  return "초대를 보내지 못했어요. 다시 시도할 수 있어요.";
}

function issuedErrorMessage(error) {
  if (error?.status === 401) return "로그인 상태를 확인한 뒤 다시 시도해 주세요.";
  if (error?.status === 403) return "초대 내역을 볼 권한이 없어요.";
  return "초대 내역을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

function invitationKey(memberId, sessionVersion, suffix, groupId, ...rest) {
  return [...INVITATION_QUERY_ROOT, memberId ?? null, sessionVersion, suffix, groupId, ...rest];
}

export function InviteMembersDialog(props) {
  const { member, sessionVersion = 0, status } = useAuth();
  const sessionKey = `${member?.id ?? "guest"}:${sessionVersion}:${status}:${props.groupId}`;
  return <InviteMembersDialogSession key={sessionKey} {...props} />;
}

function InviteMembersDialogSession({ groupId, open, onClose }) {
  const { member, sessionVersion = 0, status: authStatus } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const sessionKey = `${member?.id ?? "guest"}:${sessionVersion}:${authStatus}:${groupId}`;
  const sessionKeyRef = useRef(sessionKey);
  const mountedRef = useRef(false);
  const batchPendingRef = useRef(false);
  const requestIdsRef = useRef(new Map());
  const [activeTab, setActiveTab] = useState("invite");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedMembers, setSelectedMembers] = useState(() => new Map());
  const [targetErrors, setTargetErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);
  const [issuedScope, setIssuedScope] = useState("MINE");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [copyingId, setCopyingId] = useState(null);
  const copyingRef = useRef(false);
  const [manualUrl, setManualUrl] = useState("");
  const manualInputRef = useRef(null);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      batchPendingRef.current = false;
    };
  }, []);

  function closeDialog() {
    if (sending) return;
    setActiveTab("invite");
    onClose?.();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useLayoutEffect(() => {
    if (!manualUrl) return;
    manualInputRef.current?.focus();
    manualInputRef.current?.select();
  }, [manualUrl]);

  const validKeyword = debouncedKeyword.length === 0 || (debouncedKeyword.length >= 2 && debouncedKeyword.length <= 50);
  const candidatesQuery = useInfiniteQuery({
    queryKey: invitationKey(member?.id, sessionVersion, "candidates", groupId, debouncedKeyword),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => fetchInvitationCandidates(
      groupId,
      { keyword: debouncedKeyword, cursor: pageParam, size: PAGE_SIZE },
      undefined,
      signal
    ),
    getNextPageParam: getSafeNextCursor,
    gcTime: 0,
    retry: false,
    enabled: Boolean(open && groupId && authStatus === "authenticated" && validKeyword)
  });

  const issuedQuery = useInfiniteQuery({
    queryKey: invitationKey(member?.id, sessionVersion, "issued", groupId, issuedScope),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => fetchIssuedInvitations(
      groupId,
      { scope: issuedScope, cursor: pageParam, size: PAGE_SIZE },
      undefined,
      signal
    ),
    getNextPageParam: getSafeNextCursor,
    gcTime: 0,
    retry: false,
    enabled: Boolean(open && groupId && authStatus === "authenticated" && activeTab === "management")
  });

  const candidates = useMemo(() => {
    const pages = candidatesQuery.data?.pages ?? [];
    const merged = mergeCursorPages(pages, (item) => item.memberId);
    return merged.items.filter((item) => item.memberId !== member?.id);
  }, [candidatesQuery.data, member?.id]);

  const issuedInvitations = useMemo(() => {
    return mergeCursorPages(issuedQuery.data?.pages ?? [], (item) => item.id).items;
  }, [issuedQuery.data]);

  const isCurrentSession = useCallback((capturedSession) => (
    mountedRef.current && sessionKeyRef.current === capturedSession
  ), []);

  function toggleCandidate(candidate) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidate.memberId)) next.delete(candidate.memberId);
      else next.add(candidate.memberId);
      return next;
    });
    setSelectedMembers((current) => {
      const next = new Map(current);
      if (next.has(candidate.memberId)) next.delete(candidate.memberId);
      else next.set(candidate.memberId, candidate);
      return next;
    });
    setTargetErrors((current) => {
      const next = { ...current };
      delete next[candidate.memberId];
      return next;
    });
    setSendSummary(null);
  }

  function removeSelected(memberId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(memberId);
      return next;
    });
    setSelectedMembers((current) => {
      const next = new Map(current);
      next.delete(memberId);
      return next;
    });
    setTargetErrors((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }

  function handleTabKeyDown(event) {
    const tabs = ["invite", "management"];
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft" ? (currentIndex + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`invitation-tab-${nextTab}`)?.focus();
  }

  async function sendInvitations() {
    if (batchPendingRef.current || selectedIds.size === 0 || authStatus !== "authenticated") return;
    batchPendingRef.current = true;
    setSending(true);
    setSendSummary(null);
    const capturedSession = sessionKeyRef.current;
    const targets = [...selectedIds];
    let sentCount = 0;
    let failedCount = 0;
    let alreadyMemberCount = 0;

    try {
      for (const targetMemberId of targets) {
        if (!isCurrentSession(capturedSession)) break;
        const requestId = requestIdsRef.current.get(targetMemberId) ?? makeRequestId();
        requestIdsRef.current.set(targetMemberId, requestId);
        try {
          await createInvitation(groupId, { type: "DIRECT", targetMemberId, requestId });
          if (!isCurrentSession(capturedSession)) break;
          requestIdsRef.current.delete(targetMemberId);
          setSelectedIds((current) => {
            const next = new Set(current);
            next.delete(targetMemberId);
            return next;
          });
          setSelectedMembers((current) => {
            const next = new Map(current);
            next.delete(targetMemberId);
            return next;
          });
          setTargetErrors((current) => {
            const next = { ...current };
            delete next[targetMemberId];
            return next;
          });
          sentCount += 1;
        } catch (error) {
          if (!isCurrentSession(capturedSession)) break;
          const message = targetErrorMessage(error);
          setTargetErrors((current) => ({ ...current, [targetMemberId]: message }));
          failedCount += 1;
          if (error?.code === "GROUP_MEMBER_ALREADY_EXISTS") alreadyMemberCount += 1;
        }
      }

      if (isCurrentSession(capturedSession)) {
        const summary = { sentCount, failedCount, alreadyMemberCount };
        setSendSummary(summary);
        if (sentCount > 0) {
          await queryClient.invalidateQueries({ queryKey: INVITATION_QUERY_ROOT });
        }
      }
    } finally {
      batchPendingRef.current = false;
      if (isCurrentSession(capturedSession)) setSending(false);
    }
  }

  async function copyIssuedLink(invitation) {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopyingId(invitation.id);
    const capturedSession = sessionKeyRef.current;
    try {
      const detail = await fetchInvitation(invitation.id);
      if (!isCurrentSession(capturedSession)) return;
      const url = sharedInvitationUrl(detail.sharePath, window.location.origin);
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url);
        if (isCurrentSession(capturedSession)) {
          toast.success({
            title: detail.status === "EXPIRED" ? "만료된 링크를 복사했어요. 새 링크를 만들면 다시 사용할 수 있어요." :
              detail.status === "CANCELED" ? "취소된 링크를 복사했어요. 이 링크로는 합류할 수 없어요." : "초대 링크를 복사했어요"
          });
        }
      } catch {
        if (isCurrentSession(capturedSession)) setManualUrl(url);
      }
    } catch (error) {
      if (isCurrentSession(capturedSession)) toast.danger({ title: issuedErrorMessage(error) });
    } finally {
      copyingRef.current = false;
      if (isCurrentSession(capturedSession)) setCopyingId(null);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget || revoking) return;
    const capturedSession = sessionKeyRef.current;
    setRevoking(true);
    try {
      await revokeInvitation(revokeTarget.id);
      if (!isCurrentSession(capturedSession)) return;
      await queryClient.invalidateQueries({ queryKey: INVITATION_QUERY_ROOT });
      if (!isCurrentSession(capturedSession)) return;
      setRevokeTarget(null);
      toast.success({ title: "초대를 취소했어요" });
    } finally {
      if (isCurrentSession(capturedSession)) setRevoking(false);
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    setDebouncedKeyword(keyword.trim());
  }

  const searchLength = keyword.trim().length;
  const searchHint = searchLength === 1
    ? "크루 이름을 두 글자 이상 입력해 주세요."
    : searchLength > 50
      ? "검색어는 50자 이내로 입력해 주세요."
      : "";

  const dismissible = !sending;
  const invitePanel = activeTab === "invite";
  return (
    <>
      <Modal closeAction="invitation_members_dismiss"
        dismissible={dismissible} onClose={closeDialog} open={open} title="멤버 초대">
        <div className="invitation-dialog" data-ph-private>
          <div aria-label="초대 메뉴" className="invitation-dialog__tabs" onKeyDown={handleTabKeyDown} role="tablist" tabIndex={0}>
            <button aria-selected={invitePanel} aria-controls="invitation-panel" className="invitation-dialog__tab"
              data-ph-capture-attribute-action="invitation_invite_tab" disabled={sending} id="invitation-tab-invite"
              onClick={() => setActiveTab("invite")} role="tab" tabIndex={invitePanel ? 0 : -1} type="button">회원 초대</button>
            <button aria-selected={!invitePanel} aria-controls="invitation-panel" className="invitation-dialog__tab"
              data-ph-capture-attribute-action="invitation_management_open" disabled={sending} id="invitation-tab-management"
              onClick={() => setActiveTab("management")} role="tab" tabIndex={!invitePanel ? 0 : -1} type="button">보낸 초대</button>
          </div>

          {invitePanel ? (
            <section aria-labelledby="invitation-tab-invite" className="invitation-dialog__panel" id="invitation-panel" role="tabpanel" tabIndex={0}>
              <form className="invitation-search" onSubmit={handleSearch} role="search">
                <TextField autoComplete="off" aria-label="회원 이름 검색" aria-describedby={searchHint ? "invitation-search-hint" : undefined} data-ph-capture-attribute-action="invitation_search"
                  disabled={sending} id="invitation-member-search" maxLength={50}
                  onChange={(event) => setKeyword(event.target.value)} placeholder="크루 이름을 입력해 주세요" value={keyword} />
                <Button aria-label="회원 검색" className="invitation-search__submit" data-ph-capture-attribute-action="invitation_search_submit"
                  disabled={sending || searchLength === 1 || searchLength > 50} type="submit" variant="secondary"><Search aria-hidden="true" size={18} />검색</Button>
              </form>
              {searchHint && <p className="invitation-dialog__hint" id="invitation-search-hint">{searchHint}</p>}

              {selectedMembers.size > 0 && <section aria-label={`선택한 회원 ${selectedMembers.size}명`} className="invitation-selected">
                <div className="invitation-selected__heading"><h3>선택한 회원</h3><span>{selectedMembers.size}명</span></div>
                <ul className="invitation-selected__chips">{[...selectedMembers.values()].map((candidate) => (
                  <li className="invitation-chip" key={candidate.memberId}>
                    <span>{candidate.crewName}</span>
                    <button aria-label={`${candidate.crewName} 선택 해제`} data-ph-capture-attribute-action="invitation_chip_remove"
                      disabled={sending} onClick={() => removeSelected(candidate.memberId)} type="button"><X aria-hidden="true" size={14} /></button>
                    {targetErrors[candidate.memberId] && <span className="invitation-chip__error" role="alert">{targetErrors[candidate.memberId]}</span>}
                  </li>
                ))}</ul>
              </section>}

              <div aria-live="polite" aria-busy={candidatesQuery.isFetching} className="invitation-candidates">
                {authStatus !== "authenticated" ? <p className="invitation-state" role="status">로그인한 회원만 초대를 보낼 수 있어요.</p>
                  : searchLength === 1 ? <p className="invitation-state">크루 이름을 두 글자 이상 입력해 주세요.</p>
                    : searchLength > 50 ? <p className="invitation-state">검색어는 50자 이내로 입력해 주세요.</p>
                      : keyword.trim() !== debouncedKeyword || !validKeyword || candidatesQuery.isPending
                        ? <p className="invitation-state"><LoaderCircle aria-hidden="true" className="invitation-spin" size={18} />회원 찾아보는 중</p>
                        : candidatesQuery.isError ? <div className="invitation-state invitation-state--error" role="alert">
                          <p>{candidateErrorMessage(candidatesQuery.error)}</p>
                          <Button data-ph-capture-attribute-action="invitation_candidates_retry" onClick={() => candidatesQuery.refetch()} size="sm" variant="secondary">다시 시도</Button>
                        </div>
                          : candidates.length === 0 ? <p className="invitation-state">{debouncedKeyword ? "검색 결과가 없어요." : "초대할 수 있는 회원이 없어요."}</p>
                            : <ul aria-label="초대할 회원" className="invitation-candidate-list">{candidates.map((candidate) => {
                              const checked = selectedIds.has(candidate.memberId);
                              return <li className="invitation-candidate" key={candidate.memberId}>
                                <label className="invitation-candidate__label">
                                  <input checked={checked} data-ph-capture-attribute-action="invitation_member_select" disabled={sending}
                                    onChange={() => toggleCandidate(candidate)} type="checkbox" />
                                  <span aria-hidden="true" className="invitation-candidate__check">{checked && <Check size={14} />}</span>
                                  <span className="invitation-candidate__name">{candidate.crewName}</span>
                                  <span className="invitation-candidate__meta">{candidate.generation ? `${candidate.generation}기 · ` : ""}
                                    {roleLabel(candidate.memberType)}{courseLabel(candidate.course) ? ` · ${courseLabel(candidate.course)}` : ""}</span>
                                </label>
                                {targetErrors[candidate.memberId] && <p className="invitation-candidate__error" role="alert">{targetErrors[candidate.memberId]}</p>}
                              </li>;
                            })}</ul>}
                {candidatesQuery.hasNextPage && !candidatesQuery.isError && <Button block data-ph-capture-attribute-action="invitation_candidates_more"
                  disabled={sending || candidatesQuery.isFetchingNextPage} onClick={() => candidatesQuery.fetchNextPage()}
                  pending={candidatesQuery.isFetchingNextPage} variant="secondary">더 보기</Button>}
              </div>

              {sendSummary && <p className={`invitation-send-summary${sendSummary.failedCount ? " invitation-send-summary--partial" : ""}`} role="status">
                {sendSummary.sentCount > 0 ? `${sendSummary.sentCount}명에게 초대를 보냈어요.` : "초대를 보내지 못했어요."}
                {sendSummary.failedCount > 0 ? ` ${sendSummary.failedCount}명은 다시 확인해 주세요.` : ""}
                {sendSummary.alreadyMemberCount > 0 ? " 이미 참여 중인 회원은 선택을 해제해 주세요." : ""}
              </p>}
              <div className="invitation-dialog__actions">
                <Button data-ph-capture-attribute-action="invitation_members_cancel" disabled={sending} onClick={closeDialog} variant="secondary">닫기</Button>
                <Button aria-label={sending ? "초대 보내는 중" : `선택한 ${selectedIds.size}명 초대하기`} data-ph-capture-attribute-action="invitation_send"
                  disabled={sending || selectedIds.size === 0 || authStatus !== "authenticated"} onClick={sendInvitations}>
                  <span className="invitation-send-label">{sending ? <LoaderCircle aria-hidden="true" className="invitation-spin" size={16} /> : <UserPlus aria-hidden="true" size={16} />}
                    {sending ? "초대 보내는 중" : `선택한 ${selectedIds.size}명 초대하기`}</span>
                </Button>
              </div>
            </section>
          ) : (
            <section aria-labelledby="invitation-tab-management" className="invitation-dialog__panel" id="invitation-panel" role="tabpanel" tabIndex={0}>
              <div aria-label="보낸 초대 종류" className="invitation-scope" role="group">
                <Button aria-pressed={issuedScope === "MINE"} className={`invitation-scope__button${issuedScope === "MINE" ? " invitation-scope__button--active" : ""}`}
                  data-ph-capture-attribute-action="invitation_management_scope_change" onClick={() => setIssuedScope("MINE")} size="sm" variant="tertiary">내가 보낸 초대</Button>
                <Button aria-pressed={issuedScope === "MANAGED_LINKS"} className={`invitation-scope__button${issuedScope === "MANAGED_LINKS" ? " invitation-scope__button--active" : ""}`}
                  data-ph-capture-attribute-action="invitation_management_scope_change" onClick={() => setIssuedScope("MANAGED_LINKS")} size="sm" variant="tertiary">공유 링크</Button>
              </div>
              <p className="invitation-dialog__hint">{issuedScope === "MINE" ? "내가 보낸 지정 회원 초대를 확인할 수 있어요." : "현재 모임의 공유 링크를 확인하고 복사할 수 있어요. 만료된 링크도 복사할 수 있지만, 복사해도 만료 시각은 바뀌지 않아요."}</p>
              <div aria-busy={issuedQuery.isFetching} aria-live="polite" className="invitation-issued-list">
                {authStatus !== "authenticated" ? <p className="invitation-state" role="status">로그인 상태를 확인해 주세요.</p>
                  : issuedQuery.isPending ? <p className="invitation-state"><LoaderCircle aria-hidden="true" className="invitation-spin" size={18} />초대 내역을 불러오고 있어요.</p>
                    : issuedQuery.isError ? <div className="invitation-state invitation-state--error" role="alert">
                      <p>{issuedErrorMessage(issuedQuery.error)}</p>
                      <Button data-ph-capture-attribute-action="invitation_issued_retry" onClick={() => issuedQuery.refetch()} size="sm" variant="secondary">다시 시도</Button>
                    </div>
                      : issuedInvitations.length === 0 ? <p className="invitation-state">아직 보낸 초대가 없어요.</p>
                        : <ul className="invitation-issued-list__items">{issuedInvitations.map((invitation) => {
                          const isLink = invitation.type === "LINK";
                          const copying = copyingId === invitation.id;
                          return <li className="invitation-issued" key={invitation.id}>
                            <div className="invitation-issued__main">
                              <div className="invitation-issued__title-row"><strong>{isLink ? "공유 링크" : "회원 초대"}</strong>
                                <span className={`invitation-status invitation-status--${invitation.status.toLowerCase()}`}>{statusLabel(invitation.status)}</span></div>
                              <p>{invitation.inviter?.crewName ? `${invitation.inviter.crewName} · ` : ""}{isLink ? "모임에 참여 중인 회원이 복사할 수 있어요." : "회원에게 직접 보낸 초대예요."}</p>
                              {invitation.expiresAt ? <time dateTime={invitation.expiresAt}>만료 {invitation.expiresAt.slice(0, 10).replaceAll("-", ".")}</time> : !isLink && <span className="invitation-issued__expiry">만료 없음</span>}
                            </div>
                            <div className="invitation-issued__actions">
                              {isLink && <Button aria-label={copying ? "링크를 불러오는 중" : `${statusLabel(invitation.status)} 공유 링크 복사`}
                                className="invitation-issued__copy" data-ph-capture-attribute-action="invitation_link_copy" disabled={copying}
                                onClick={() => copyIssuedLink(invitation)} size="sm" variant="secondary">
                                <span className="invitation-share-button__content">{copying ? <LoaderCircle aria-hidden="true" className="invitation-spin" size={15} /> : <Copy aria-hidden="true" size={15} />}
                                  {copying ? "불러오는 중" : "링크 복사"}</span>
                              </Button>}
                              {invitation.canRevoke && <Button data-ph-capture-attribute-action="invitation_revoke_open" onClick={() => setRevokeTarget(invitation)} size="sm" variant="tertiary">취소</Button>}
                            </div>
                          </li>;
                        })}</ul>}
                {issuedQuery.hasNextPage && !issuedQuery.isError && <Button block data-ph-capture-attribute-action="invitation_issued_more"
                  onClick={() => issuedQuery.fetchNextPage()} pending={issuedQuery.isFetchingNextPage} variant="secondary">더 보기</Button>}
              </div>
            </section>
          )}
        </div>
      </Modal>

      <ConfirmDialog cancelAction="invitation_revoke_cancel" confirmAction="invitation_revoke" confirmLabel="초대 취소" danger
        description="취소한 초대는 상대가 수락할 수 없어요." onClose={() => setRevokeTarget(null)} onConfirm={confirmRevoke}
        open={Boolean(revokeTarget)} pending={revoking} title="초대를 취소할까요?" />
      <Modal closeAction="invitation_link_copy_dismiss" description="주소를 선택해 직접 복사할 수 있어요."
        onClose={() => setManualUrl("")} open={Boolean(manualUrl)} title="초대 링크 복사">
        <div className="invitation-fallback" data-ph-private>
          <TextField className="invitation-fallback__url" id="issued-invitation-share-url" label="초대 링크" ref={manualInputRef} readOnly value={manualUrl} />
          <p className="invitation-fallback__help">주소가 선택되어 있어요. 복사한 뒤 초대할 사람에게 보내 주세요.</p>
          <Button block data-ph-capture-attribute-action="invitation_link_copy_select" onClick={() => {
            manualInputRef.current?.focus(); manualInputRef.current?.select();
          }} variant="secondary"><span className="invitation-share-button__content"><Copy aria-hidden="true" size={16} />주소 선택</span></Button>
        </div>
      </Modal>
    </>
  );
}
