import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { IconButton } from "./Button.jsx";

const ToastContext = createContext(null);
let nextToastId = 0;
const DEFAULT_TOAST_DURATION = 2000;
const TOAST_EXIT_DURATION = 180;

export function ToastProvider({ children, duration = DEFAULT_TOAST_DURATION, limit = 3 }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const exitTimers = useRef(new Map());

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
      for (const timer of exitTimers.current.values()) window.clearTimeout(timer);
      exitTimers.current.clear();
    },
    []
  );

  useEffect(() => {
    const activeIds = new Set(toasts.map((toast) => toast.id));
    for (const [id, timer] of timers.current) {
      if (!activeIds.has(id)) {
        window.clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    for (const [id, timer] of exitTimers.current) {
      if (!activeIds.has(id)) {
        window.clearTimeout(timer);
        exitTimers.current.delete(id);
      }
    }
  }, [toasts]);

  const dismiss = useCallback((id) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    if (exitTimers.current.has(id)) return;

    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, isDismissing: true } : toast
      )
    );
    exitTimers.current.set(
      id,
      window.setTimeout(() => {
        exitTimers.current.delete(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_EXIT_DURATION)
    );
  }, []);

  const startTimer = useCallback(
    (toast, timeout = duration) => {
      if (timeout <= 0) return;
      window.clearTimeout(timers.current.get(toast.id));
      timers.current.set(
        toast.id,
        window.setTimeout(() => dismiss(toast.id), timeout)
      );
    },
    [dismiss, duration]
  );

  const show = useCallback(
    (input) => {
      const toast = {
        tone: "neutral",
        ...input,
        duration,
        id: `toast-${(nextToastId += 1)}`
      };
      setToasts((current) => [...current, toast].slice(-limit));
      startTimer(toast, toast.duration);
      return toast.id;
    },
    [duration, limit, startTimer]
  );

  const value = useMemo(
    () => ({
      danger: (input) => show({ ...input, tone: "danger" }),
      dismiss,
      show,
      success: (input) => show({ ...input, tone: "success" }),
      warning: (input) => show({ ...input, tone: "warning" })
    }),
    [dismiss, show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol aria-atomic="false" aria-live="polite" className="ui-toasts" role="status">
        {toasts.map((toast) => (
          <li
            className={`ui-toast ui-toast--${toast.tone}${toast.isDismissing ? " ui-toast--dismissing" : ""}`}
            key={toast.id}
          >
            <div className="ui-toast__body">
              <p className="ui-toast__title">{toast.title}</p>
              {toast.description ? (
                <p className="ui-toast__description">{toast.description}</p>
              ) : null}
            </div>
            <IconButton
              label="알림 닫기"
              onClick={() => dismiss(toast.id)}
              size="sm"
              variant="tertiary"
            >
              ×
            </IconButton>
          </li>
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
