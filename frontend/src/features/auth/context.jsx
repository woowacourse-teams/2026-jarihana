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
import { bootstrapAuth } from "./bootstrap";
import { logout as logoutRequest } from "./api";
import { createGithubAuthorizationUrl } from "./oauth";

const AuthContext = createContext(null);

const stateFromProfile = (profile) => {
  if (!profile.signupCompleted) {
    return { error: null, member: null, status: "signup-required" };
  }
  return { error: null, member: profile.member, status: "authenticated" };
};

export const AuthProvider = ({ children }) => {
  const bootstrapStarted = useRef(false);
  const [state, setState] = useState({ error: null, member: null, status: "loading" });

  const reload = useCallback(async () => {
    await Promise.resolve();
    setState((current) => ({ ...current, error: null, status: "loading" }));
    try {
      setState(stateFromProfile(await bootstrapAuth()));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ error: null, member: null, status: "anonymous" });
        return;
      }
      setState({ error, member: null, status: "unavailable" });
      throw error;
    }
  }, []);

  useEffect(() => {
    if (bootstrapStarted.current) {
      return;
    }
    bootstrapStarted.current = true;
    apiClient.setSessionExpiredHandler(() => {
      setState({ error: null, member: null, status: "anonymous" });
    });
    queueMicrotask(() => {
      void reload().catch(() => undefined);
    });
  }, [reload]);

  const login = useCallback(() => {
    window.location.assign(createGithubAuthorizationUrl());
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setState({ error: null, member: null, status: "anonymous" });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      reload,
      retry: reload
    }),
    [login, logout, reload, state]
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
