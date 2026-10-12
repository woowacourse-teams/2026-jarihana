import { useLayoutEffect, useRef, useState } from "react";
import { Copy, Link2, LoaderCircle } from "lucide-react";

import { useAuth } from "../auth";
import { Button, Modal, TextField, useToast } from "../../shared/ui";
import { createInvitation, sharedInvitationUrl } from "./api";
import "./invitation-controls.css";

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_byte, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionMessage(error) {
  if (error?.status === 401) return "로그인 상태를 확인한 뒤 다시 시도해 주세요.";
  if (error?.status === 403) return "이 모임의 구성원만 초대 링크를 만들 수 있어요.";
  if (error?.code === "GROUP_ENDED") return "종료된 모임에서는 새 초대 링크를 만들 수 없어요.";
  return "초대 링크를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

export function ShareInvitationButton(props) {
  const { member, sessionVersion = 0, status } = useAuth();
  const sessionKey = `${member?.id ?? "guest"}:${sessionVersion}:${status}:${props.groupId}`;
  return <ShareInvitationButtonSession key={sessionKey} {...props} />;
}

function ShareInvitationButtonSession({ groupId, className = "" }) {
  const { member, sessionVersion = 0, status } = useAuth();
  const toast = useToast();
  const sessionKey = `${member?.id ?? "guest"}:${sessionVersion}:${status}:${groupId}`;
  const sessionKeyRef = useRef(sessionKey);
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const requestIdRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const manualInputRef = useRef(null);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!manualUrl) return;
    manualInputRef.current?.focus();
    manualInputRef.current?.select();
  }, [manualUrl]);

  async function handleCopy() {
    if (pendingRef.current || !groupId) return;
    pendingRef.current = true;
    setPending(true);
    const requestSession = sessionKeyRef.current;
    const isCurrent = () => mountedRef.current && sessionKeyRef.current === requestSession;

    try {
      const result = await createInvitation(groupId, {
        type: "LINK",
        requestId: requestIdRef.current ?? (requestIdRef.current = requestId())
      });
      if (!isCurrent()) return;

      const url = sharedInvitationUrl(result.sharePath, window.location.origin);
      requestIdRef.current = null;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url);
        if (isCurrent()) toast.success({ title: result.reused ? "기존 초대 링크를 복사했어요" : "초대 링크를 복사했어요" });
      } catch {
        if (isCurrent()) setManualUrl(url);
      }
    } catch (error) {
      if (isCurrent()) toast.danger({ title: sessionMessage(error) });
      // Keep the request ID after a failed request so a retry reuses the same issuance.
    } finally {
      pendingRef.current = false;
      if (isCurrent()) setPending(false);
    }
  }

  function selectManualUrl() {
    manualInputRef.current?.focus();
    manualInputRef.current?.select();
  }

  return (
    <>
      <Button
        className={`invitation-share-button ${className}`.trim()}
        data-ph-capture-attribute-action="invitation_link_copy"
        aria-label={pending ? "초대 링크 준비 중" : "초대 링크 복사"}
        disabled={pending || status !== "authenticated" || !groupId}
        onClick={handleCopy}
        variant="secondary"
      >
        <span className="invitation-share-button__content">
          {pending ? <LoaderCircle aria-hidden="true" className="invitation-spin" size={16} /> : <Link2 aria-hidden="true" size={16} />}
          {pending ? "링크 준비 중" : "초대 링크 복사"}
        </span>
      </Button>
      <Modal
        closeAction="invitation_link_copy_dismiss"
        description="주소를 선택해 직접 복사할 수 있어요."
        onClose={() => setManualUrl("")}
        open={Boolean(manualUrl)}
        title="초대 링크 복사"
      >
        <div className="invitation-fallback" data-ph-private>
          <TextField
            className="invitation-fallback__url"
            id="invitation-share-url"
            label="초대 링크"
            ref={manualInputRef}
            readOnly
            value={manualUrl}
          />
          <p className="invitation-fallback__help">주소가 선택되어 있어요. 복사한 뒤 초대할 사람에게 보내 주세요.</p>
          <Button
            block
            data-ph-capture-attribute-action="invitation_link_copy_select"
            onClick={selectManualUrl}
            variant="secondary"
          >
            <span className="invitation-share-button__content"><Copy aria-hidden="true" size={16} />주소 선택</span>
          </Button>
        </div>
      </Modal>
    </>
  );
}
