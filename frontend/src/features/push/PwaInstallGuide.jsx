import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bell, Smartphone } from "lucide-react";
import { useLocation } from "react-router";

import { Checkbox, Modal } from "../../shared/ui";
import brandMark from "../../shared/assets/brand/jarihana-favicon.png";
import { useAuth } from "../auth";
import { hasActivePushSubscription } from "./api";
import "./pwa-install-guide.css";

const snoozeKey = "jarihana:pwa-guide:hidden-until";
const sevenDays = 7 * 24 * 60 * 60 * 1000;
const steps = [
  {
    alt: "Chrome 주소창 오른쪽의 공유 버튼",
    className: "share",
    image: "/images/ios-pwa-guide/safari-share.jpeg",
    title: "공유를 눌러요"
  },
  {
    alt: "공유 메뉴에서 홈 화면에 추가 항목을 선택하는 화면",
    className: "menu",
    image: "/images/ios-pwa-guide/home-screen-add-hq.jpeg",
    title: "홈 화면에 추가해요"
  },
  {
    alt: "자리하나 화면 오른쪽 위의 목록 버튼",
    className: "hamburger",
    image: "/images/ios-pwa-guide/menu-hamburger.png",
    title: "목록 버튼을 눌러요"
  },
  {
    alt: "전체 메뉴 오른쪽 위의 종 버튼",
    className: "bell",
    image: "/images/ios-pwa-guide/menu-bell.png",
    title: "종 버튼을 눌러요"
  },
  {
    alt: "자리하나 알림함의 이 브라우저 푸시 알림 스위치",
    className: "push",
    image: "/images/ios-pwa-guide/notification-push-setting.png",
    title: "푸시 알림을 켜요"
  }
];

function getSnoozed() {
  try {
    const expiry = Number(window.localStorage.getItem(snoozeKey));
    if (expiry > Date.now()) return true;
    if (expiry) window.localStorage.removeItem(snoozeKey);
  } catch {
    return false;
  }
  return false;
}

function getInitialPlatform() {
  return /Android/i.test(window.navigator?.userAgent ?? "") ? "android" : "ios";
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? "")
    || (window.navigator?.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function GuideTitle() {
  return (
    <span className="pwa-guide__title">
      <img alt="" className="pwa-guide__brand-mark" src={brandMark} />
      <span className="pwa-guide__brand-name">자리하나?</span>
      <span aria-hidden="true" className="pwa-guide__divider" />
      <span className="pwa-guide__title-label">PWA 앱 설치 및 알림 설정 가이드</span>
    </span>
  );
}

function PlatformTabs({ platform, onPlatformChange }) {
  const iosReference = useRef(null);
  const androidReference = useRef(null);
  const references = { android: androidReference, ios: iosReference };

  function handleKeyDown(event) {
    const target = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? platform === "ios" ? "android" : "ios"
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? platform === "ios" ? "android" : "ios"
        : event.key === "Home" ? "ios" : event.key === "End" ? "android" : null;
    if (!target) return;
    event.preventDefault();
    onPlatformChange(target);
    references[target].current?.focus();
  }

  return (
    <div aria-label="기기 선택" className="pwa-guide__tabs" role="tablist">
      <button
        aria-controls="pwa-guide-panel"
        aria-selected={platform === "ios"}
        className="pwa-guide__tab"
        data-ph-capture-attribute-action="pwa_guide_platform_ios"
        id="pwa-guide-tab-ios"
        onClick={() => onPlatformChange("ios")}
        onKeyDown={handleKeyDown}
        ref={iosReference}
        role="tab"
        tabIndex={platform === "ios" ? 0 : -1}
        type="button"
      >
        <Smartphone aria-hidden="true" size={17} />
        iOS
      </button>
      <button
        aria-controls="pwa-guide-panel"
        aria-selected={platform === "android"}
        className="pwa-guide__tab"
        data-ph-capture-attribute-action="pwa_guide_platform_android"
        id="pwa-guide-tab-android"
        onClick={() => onPlatformChange("android")}
        onKeyDown={handleKeyDown}
        ref={androidReference}
        role="tab"
        tabIndex={platform === "android" ? 0 : -1}
        type="button"
      >
        <Smartphone aria-hidden="true" size={17} />
        Android
      </button>
    </div>
  );
}

function Screenshot({ step }) {
  return (
    <div className={`pwa-guide__screenshot pwa-guide__screenshot--${step.className}`}>
      <img alt={step.alt} src={step.image} />
      {step.className === "share" ? <span aria-hidden="true" className="pwa-guide__share-focus" /> : null}
      {step.className === "menu" ? <span aria-hidden="true" className="pwa-guide__menu-focus" /> : null}
      {step.className === "hamburger" ? <span aria-hidden="true" className="pwa-guide__hamburger-focus" /> : null}
      {step.className === "bell" ? <>
        <span aria-hidden="true" className="pwa-guide__bell-badge-cover" />
        <Bell aria-hidden="true" className="pwa-guide__bell-restored" />
        <span aria-hidden="true" className="pwa-guide__bell-focus" />
      </> : null}
      {step.className === "push" ? <span aria-hidden="true" className="pwa-guide__push-focus" /> : null}
    </div>
  );
}

export const PwaInstallGuide = forwardRef(function PwaInstallGuide({ triggerClassName = "" }, reference) {
  const { pathname } = useLocation();
  const { member, sessionVersion = 0, status: authStatus } = useAuth();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(getInitialPlatform);
  const [stepIndex, setStepIndex] = useState(0);
  const [hideForSevenDays, setHideForSevenDays] = useState(false);
  const panelReference = useRef(null);

  useEffect(() => {
    if (pathname !== "/" || !isMobileDevice()
      || !["anonymous", "signup-required", "authenticated"].includes(authStatus)) return undefined;
    let current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const snoozed = getSnoozed();
        setHideForSevenDays(snoozed);
        if (snoozed) return;
        if (authStatus === "authenticated") {
          try {
            if (await hasActivePushSubscription()) return;
          } catch {
            return;
          }
        }
        if (!current) return;
        setPlatform(getInitialPlatform());
        setStepIndex(0);
        setOpen(true);
      })();
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [authStatus, member?.id, pathname, sessionVersion]);

  const openGuide = useCallback(() => {
    setPlatform(getInitialPlatform());
    setStepIndex(0);
    setHideForSevenDays(getSnoozed());
    setOpen(true);
  }, []);

  useImperativeHandle(reference, () => ({ open: openGuide }), [openGuide]);

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen);
  }

  function handleSnoozeChange(event) {
    const checked = event.target.checked;
    setHideForSevenDays(checked);
    try {
      if (checked) window.localStorage.setItem(snoozeKey, String(Date.now() + sevenDays));
      else window.localStorage.removeItem(snoozeKey);
    } catch {
      return;
    }
  }

  function changePlatform(nextPlatform) {
    setPlatform(nextPlatform);
    setStepIndex(0);
    if (panelReference.current) panelReference.current.scrollTop = 0;
  }

  function changeStep(nextStep) {
    setStepIndex(nextStep);
    if (panelReference.current) panelReference.current.scrollTop = 0;
  }

  const activeStep = steps[stepIndex];
  const isIOS = platform === "ios";

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={["pwa-guide__reopen", triggerClassName || "app-footer__social-link"].join(" ")}
        data-ph-capture-attribute-action="pwa_guide_reopen"
        onClick={openGuide}
        type="button"
      >
        설치 안내 보기
      </button>
      <Modal
        closeAction="pwa_guide_dismiss"
        onOpenChange={handleOpenChange}
        open={open}
        title={<GuideTitle />}
      >
        <div className="pwa-guide">
          <PlatformTabs onPlatformChange={changePlatform} platform={platform} />
          <div
            aria-labelledby={`pwa-guide-tab-${platform}`}
            className="pwa-guide__panel"
            id="pwa-guide-panel"
            ref={panelReference}
            role="tabpanel"
            tabIndex={0}
          >
            {isIOS ? <>
              <div className="pwa-guide__progress-row">
                <span aria-label={`전체 ${steps.length}단계 중 ${stepIndex + 1}단계`} className="pwa-guide__count">
                  {stepIndex + 1} / {steps.length}
                </span>
              </div>
              <div
                aria-label="안내 진행률"
                aria-valuemax={steps.length}
                aria-valuemin="1"
                aria-valuenow={stepIndex + 1}
                className="pwa-guide__progress"
                role="progressbar"
              >
                <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
              </div>
              <section aria-labelledby={`pwa-guide-step-${stepIndex}`} className="pwa-guide__step">
                <h3 id={`pwa-guide-step-${stepIndex}`}>{activeStep.title}</h3>
                <Screenshot step={activeStep} />
              </section>
            </> : <p className="pwa-guide__coming-soon" role="status">준비중입니다</p>}
          </div>
          <footer className="pwa-guide__footer">
            {isIOS ? <div className="pwa-guide__navigation">
              <button
                data-ph-capture-attribute-action="pwa_guide_previous"
                disabled={stepIndex === 0}
                onClick={() => changeStep(Math.max(0, stepIndex - 1))}
                type="button"
              >
                이전
              </button>
              <button
                className="pwa-guide__next"
                data-ph-capture-attribute-action={stepIndex === steps.length - 1 ? "pwa_guide_complete" : "pwa_guide_next"}
                onClick={() => {
                  if (stepIndex === steps.length - 1) handleOpenChange(false);
                  else changeStep(Math.min(steps.length - 1, stepIndex + 1));
                }}
                type="button"
              >
                {stepIndex === steps.length - 1 ? "완료" : "다음"}
              </button>
            </div> : null}
            <Checkbox
              checked={hideForSevenDays}
              data-ph-capture-attribute-action="pwa_guide_hide_seven_days_toggle"
              label="7일간 보지 않기"
              onChange={handleSnoozeChange}
            />
          </footer>
        </div>
      </Modal>
    </>
  );
});
