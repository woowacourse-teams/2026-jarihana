import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./Button.jsx";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function focusableElements(root) {
  return [...root.querySelectorAll(focusableSelector)].filter((element) => element.tabIndex >= 0);
}

function useOpenState(open, defaultOpen, onOpenChange, onClose) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const visible = controlled ? open : internalOpen;

  function setVisible(next) {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) onClose?.();
  }

  return [visible, setVisible, controlled];
}

function useFocusReturn(visible) {
  const openerReference = useRef(null);
  const wasVisible = useRef(false);

  useLayoutEffect(() => {
    if (visible && !wasVisible.current) openerReference.current = document.activeElement;
    if (!visible && wasVisible.current) openerReference.current?.focus();
    wasVisible.current = visible;
  }, [visible]);

  return openerReference;
}

function OverlayPanel({
  children,
  closeLabel = "닫기",
  description,
  mode = "modal",
  onDismiss,
  title
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelReference = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusableElements(panelReference.current)[0]?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(panelReference.current);
      if (elements.length === 0) {
        event.preventDefault();
        panelReference.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onDismiss]);

  const drawer = mode === "drawer";
  return createPortal(
    <div
      className={drawer ? "ui-overlay ui-drawer-overlay" : "ui-overlay"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={drawer ? "ui-drawer" : "ui-dialog"}
        ref={panelReference}
        role="dialog"
        tabIndex={-1}
      >
        <IconButton
          className="ui-dialog__close"
          label={closeLabel}
          onClick={onDismiss}
          variant="tertiary"
        >
          ×
        </IconButton>
        <h2 className="ui-dialog__title" id={titleId}>
          {title}
        </h2>
        {description ? (
          <p className="ui-dialog__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <div className="ui-dialog__content">{children}</div>
      </section>
    </div>,
    document.body
  );
}

function Trigger({ children, expanded, onOpen }) {
  if (!isValidElement(children)) return children;
  const originalClick = children.props.onClick;
  return cloneElement(children, {
    "aria-expanded": expanded,
    "aria-haspopup": "dialog",
    onClick(event) {
      originalClick?.(event);
      if (!event.defaultPrevented) onOpen();
    }
  });
}

export function Modal({
  children,
  defaultOpen = false,
  description,
  onClose,
  onOpenChange,
  open,
  title,
  trigger
}) {
  const [visible, setVisible] = useOpenState(open, defaultOpen, onOpenChange, onClose);
  useFocusReturn(visible);

  function show() {
    setVisible(true);
  }

  function dismiss() {
    setVisible(false);
  }

  return (
    <>
      {trigger ? (
        <Trigger expanded={visible} onOpen={show}>
          {trigger}
        </Trigger>
      ) : null}
      {visible ? (
        <OverlayPanel description={description} onDismiss={dismiss} title={title}>
          {children}
        </OverlayPanel>
      ) : null}
    </>
  );
}

export function Drawer({
  children,
  defaultOpen = false,
  onClose,
  onOpenChange,
  open,
  title,
  trigger
}) {
  const [visible, setVisible] = useOpenState(open, defaultOpen, onOpenChange, onClose);
  useFocusReturn(visible);
  function show() {
    setVisible(true);
  }
  function dismiss() {
    setVisible(false);
  }
  return (
    <>
      {trigger ? (
        <Trigger expanded={visible} onOpen={show}>
          {trigger}
        </Trigger>
      ) : null}
      {visible ? (
        <OverlayPanel mode="drawer" onDismiss={dismiss} title={title}>
          {children}
        </OverlayPanel>
      ) : null}
    </>
  );
}

export function ConfirmDialog({
  cancelLabel = "취소",
  confirmLabel = "확인",
  danger = false,
  description,
  onClose,
  onConfirm,
  onConfirmError,
  open,
  pending = false,
  title,
  trigger
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [internalPending, setInternalPending] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const controlled = open !== undefined;
  const visible = controlled ? open : uncontrolledOpen;
  const submitting = pending || internalPending;

  function close() {
    if (!controlled) setUncontrolledOpen(false);
    onClose?.();
  }

  async function confirm() {
    if (submitting) return;
    setConfirmError(false);
    setInternalPending(true);
    try {
      await onConfirm?.();
      close();
    } catch (error) {
      setConfirmError(true);
      onConfirmError?.(error);
    } finally {
      setInternalPending(false);
    }
  }

  return (
    <Modal
      description={description}
      onClose={close}
      onOpenChange={controlled ? undefined : setUncontrolledOpen}
      open={visible}
      title={title}
      trigger={trigger}
    >
      {confirmError ? (
        <p className="ui-field__error" role="alert">
          요청을 완료하지 못했어요. 다시 시도해 주세요.
        </p>
      ) : null}
      <div className="ui-dialog__actions">
        <Button disabled={submitting} onClick={close} variant="secondary">
          {cancelLabel}
        </Button>
        <Button onClick={confirm} pending={submitting} variant={danger ? "danger" : "primary"}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
