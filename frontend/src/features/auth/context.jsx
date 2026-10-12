import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { apiClient, ApiError } from "../../shared/api";
import { beginLoginAttempt, finishLoginAttempt } from "../../shared/analytics/loginConversion";
import { refreshLogoutBinding } from "../push/api";
import { disarmPush, removeBrowserSubscription } from "../push/browser";
import { bootstrapAuth } from "./bootstrap";
import { logout as logoutRequest } from "./api";
import { createGithubAuthorizationUrl } from "./oauth";

const AuthContext = createContext(null);
function broadcastSession(type) {
  try { localStorage.setItem("jarihana:auth:session", JSON.stringify({ type, nonce: crypto.randomUUID() })); }
  catch { /* Storage may be unavailable; Service Worker disarm still fences push processing. */ }
}

const stateFromProfile = (profile) => {
  const avatarUrl = profile.avatarUrl ?? profile.member?.avatarUrl ?? null;

  if (!profile.signupCompleted) {
    return { avatarUrl, error: null, member: null, status: "signup-required" };
  }
  return { avatarUrl, error: null, member: profile.member, status: "authenticated" };
};

export const AuthProvider = ({ children }) => {
  const bootstrapStarted = useRef(false);
  const requestVersion = useRef(0);
  const logoutStarted = useRef(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [logoutError, setLogoutError] = useState(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [state, setState] = useState({ avatarUrl: null, error: null, member: null, status: "loading" });

  const reload = useCallback(async () => {
    if (logoutStarted.current) return;
    const version = ++requestVersion.current;
    setSessionVersion((current) => current + 1);
    await Promise.resolve();
    setState((current) => ({ ...current, error: null, status: "loading" }));
    try {
      const profile = await bootstrapAuth();
      if (version === requestVersion.current) setState(stateFromProfile(profile));
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setState({ avatarUrl: null, error: null, member: null, status: "anonymous" });
        return;
      }
      setState({ avatarUrl: null, error, member: null, status: "unavailable" });
      throw error;
    }
  }, []);

  useEffect(() => {
    if (bootstrapStarted.current) {
      return;
    }
    bootstrapStarted.current = true;
    apiClient.setSessionExpiredHandler(() => {
      requestVersion.current += 1;
      setSessionVersion((current) => current + 1);
      void disarmPush(null).catch(() => undefined);
      setState({ avatarUrl: null, error: null, member: null, status: "anonymous" });
    });
    queueMicrotask(() => {
      void reload().catch(() => undefined);
    });
  }, [reload]);

  useEffect(() => {
    function changedSession(event) {
      if (event.key !== "jarihana:auth:session" || !event.newValue) return;
      let message;
      try { message = JSON.parse(event.newValue); } catch { return; }
      if (!["disarm", "logout"].includes(message.type)) return;
      setSessionVersion((current) => current + 1);
      if (message.type === "logout") {
        requestVersion.current += 1;
        setState({ avatarUrl: null, error: null, member: null, status: "anonymous" });
      }
    }
    window.addEventListener("storage", changedSession);
    return () => window.removeEventListener("storage", changedSession);
  }, []);

  const login = useCallback(() => {
    const authorizationUrl = createGithubAuthorizationUrl();
    beginLoginAttempt();
    void disarmPush(state.member?.id).then(() => window.location.assign(authorizationUrl)).catch(() => {
      setLogoutError("푸시 연결을 정리하지 못했어요. 다시 시도해 주세요.");
    });
  }, [state.member]);

  const logout = useCallback(async () => {
    if (logoutStarted.current) return;
    logoutStarted.current = true;
    requestVersion.current += 1;
    setSessionVersion((current) => current + 1);
    setLogoutPending(true);
    setLogoutError(null);
    try {
      const binding = await disarmPush(state.member?.id);
      broadcastSession("disarm");
      try { await logoutRequest(undefined, binding); }
      catch (error) {
        if (!binding || error.code !== "PUSH_SUBSCRIPTION_NOT_FOUND") throw error;
        const currentBinding = await refreshLogoutBinding(binding);
        await logoutRequest(undefined, currentBinding);
      }
      requestVersion.current += 1;
      setSessionVersion((current) => current + 1);
      finishLoginAttempt("anonymous");
      setState({ avatarUrl: null, error: null, member: null, status: "anonymous" });
      broadcastSession("logout");
      await removeBrowserSubscription().catch(() => undefined);
    } catch (error) {
      setLogoutError("로그아웃하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.");
      throw error;
    } finally {
      logoutStarted.current = false;
      setLogoutPending(false);
    }
  }, [state.member]);

  const value = useMemo(
    () => ({
      ...state,
      sessionVersion,
      logoutError,
      logoutPending,
      login,
      logout,
      reload,
      retry: reload
    }),
    [login, logout, reload, state, sessionVersion, logoutError, logoutPending]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return auth;
};
