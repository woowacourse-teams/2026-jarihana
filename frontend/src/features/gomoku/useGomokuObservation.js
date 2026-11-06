import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { gomokuApi } from "./api";

function claimTabRequest(storageKey, requestId, signal, lockReleased) {
  if (!navigator.locks) return Promise.resolve(requestId);
  return new Promise((resolve, reject) => {
    const requestLock = (key) =>
      navigator.locks.request(`${storageKey}:${key}`, { ifAvailable: true }, (lock) => {
        if (signal.aborted) {
          resolve(null);
          return;
        }
        if (!lock) return requestLock(crypto.randomUUID());
        resolve(key);
        return new Promise((release) => signal.addEventListener("abort", release, { once: true }));
      });

    // A retry can start before the browser releases this tab's previous lock.
    lockReleased.current = Promise.resolve(lockReleased.current)
      .then(() => {
        if (signal.aborted) {
          resolve(null);
          return;
        }
        return requestLock(requestId);
      })
      .catch(reject);
  });
}

export function useGomokuObservation(roomId) {
  const { member, status, sessionVersion } = useAuth();
  const storageKey = `gomoku-observation:${member?.id}:${roomId}`;
  const owner = `${storageKey}:${sessionVersion}`;
  const [state, setState] = useState({ owner, participationId: null, error: null, leaving: false });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const lockReleased = useRef(null);
  const admission = useRef(null);
  const leaving = useRef(false);
  const current =
    state.owner === owner ? state : { participationId: null, error: null, leaving: false };

  useEffect(() => {
    if (status !== "authenticated") return undefined;
    const version = ++generation.current;
    const controller = new AbortController();
    let requestId;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      requestId =
        typeof saved?.requestId === "string" &&
        /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(saved.requestId)
          ? saved.requestId
          : null;
    } catch {
      // A restricted tab can still observe for its current lifetime.
    }
    requestId ||=
      admission.current?.owner === owner ? admission.current.requestId : crypto.randomUUID();
    admission.current = { owner, requestId, participationId: null };
    void claimTabRequest(storageKey, requestId, controller.signal, lockReleased)
      .then(async (ownedRequest) => {
        if (controller.signal.aborted || generation.current !== version) return null;
        setState({ owner, participationId: null, error: null, leaving: false });
        requestId = ownedRequest;
        admission.current = { owner, requestId, participationId: null };
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ requestId }));
        } catch {
          // Keep the same request key in memory when tab storage is unavailable.
        }
        return gomokuApi.observe(roomId, requestId, controller.signal);
      })
      .then((result) => {
        if (!result || controller.signal.aborted || generation.current !== version) return;
        admission.current = { owner, requestId, participationId: result.participationId };
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ requestId, participationId: result.participationId })
          );
        } catch {
          // The in-memory admission still supports connection recovery.
        }
        setState({ owner, participationId: result.participationId, error: null, leaving: false });
      })
      .catch((failure) => {
        if (controller.signal.aborted || generation.current !== version) return;
        if (failure.status === 409) {
          admission.current = null;
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // A retry still uses a new request key in this mounted tab.
          }
        }
        setState({
          owner,
          participationId: null,
          leaving: false,
          error: [403, 404, 409].includes(failure.status)
            ? "지금은 관전할 수 없는 방이에요. 대기실에서 진행 중인 공개방을 선택해 주세요."
            : "관전을 시작하지 못했어요. 다시 시도해 주세요."
        });
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [roomId, status, owner, storageKey, attempt]);

  const leave = useCallback(async () => {
    const active = admission.current;
    if (leaving.current || active?.owner !== owner || !active.participationId) return false;
    const version = generation.current;
    leaving.current = true;
    setState((previous) => ({ ...previous, leaving: true, error: null }));
    try {
      await gomokuApi.leaveObservation(roomId, active.participationId);
      if (generation.current !== version) return false;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // A completed server-side admission cannot be reused even if storage is restricted.
      }
      admission.current = null;
      return true;
    } catch {
      if (generation.current === version)
        setState((previous) => ({
          ...previous,
          error: "관전을 종료하지 못했어요. 다시 나가기를 눌러 주세요."
        }));
      return false;
    } finally {
      leaving.current = false;
      if (generation.current === version) setState((previous) => ({ ...previous, leaving: false }));
    }
  }, [roomId, owner, storageKey]);

  return { ...current, leave, retry: () => setAttempt((previous) => previous + 1) };
}
