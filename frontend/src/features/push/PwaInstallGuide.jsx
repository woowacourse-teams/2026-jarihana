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
const iosChromeSteps = [
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
const iosSafariSteps = [
  {
    alt: "Safari 주소창 아래의 공유 버튼",
    className: "safari-share",
    image: "/images/ios-pwa-guide/ios-safari-share.jpeg",
    title: "공유를 눌러요"
  },
  ...iosChromeSteps.slice(1)
];
const androidSamsungInstallStart = [
  {
    alt: "삼성 브라우저의 현재 페이지 추가 메뉴 항목",
    className: "samsung-menu",
    image: "/images/android-samsung-guide/menu.png",
    title: "삼점 메뉴에서 현재 페이지 추가"
  },
  {
    alt: "웹 앱으로 설치와 홈 화면 추가 중 선택하는 삼성 브라우저 메뉴",
    className: "samsung-install-options",
    image: "/images/android-samsung-guide/add-options.png",
    title: "설치 방법을 골라요",
    type: "install-path"
  }
];
const androidChromeInstallStart = [
  {
    alt: "Chrome 메뉴에서 설치 및 바로가기 만들기를 선택하는 화면",
    className: "android-chrome-menu-install",
    image: "/images/android-chrome-guide/menu-install.png",
    title: "설치 메뉴를 눌러요"
  },
  {
    alt: "Chrome에서 설치와 바로가기 만들기 중 선택하는 화면",
    className: "android-chrome-install-choice",
    image: "/images/android-chrome-guide/install-choice.png",
    title: "설치 방법을 골라요",
    type: "chrome-install-path"
  }
];
const androidSamsungWebAppSteps = [
  {
    alt: "앱스 화면에 웹페이지를 추가할지 묻는 확인 창",
    className: "samsung-install-confirm",
    image: "/images/android-samsung-guide/install-confirm.png",
    title: "앱스 화면에 추가해요"
  },
  {
    alt: "Google Play 프로텍트 안내의 세부정보 더보기",
    className: "samsung-play-protect-details",
    image: "/images/android-samsung-guide/play-protect-details.png",
    title: "세부정보 더보기를 눌러요"
  },
  {
    alt: "Google Play 프로텍트 안내의 무시하고 설치하기 선택 화면",
    className: "samsung-play-protect-install",
    image: "/images/android-samsung-guide/play-protect-install.png",
    title: "무시하고 설치한 뒤 인증해요"
  }
];
const androidSamsungHomeScreenSteps = [
  {
    alt: "홈 화면에 추가 창에서 앱 이름과 추가 버튼을 확인하는 화면",
    className: "samsung-home-screen-name",
    image: "/images/android-samsung-guide/home-screen-name.png",
    title: "이름을 확인하고 추가해요"
  },
  {
    alt: "홈 화면 바로가기 추가 안내의 추가 버튼",
    className: "samsung-home-screen-confirm",
    image: "/images/android-samsung-guide/home-screen-confirm.png",
    title: "확인 창에서 추가를 눌러요"
  }
];
const androidSamsungNotificationSteps = [
  ...iosChromeSteps.slice(2, 4),
  {
    ...iosChromeSteps[4],
    title: "푸시 알림을 켜고 허용해요"
  }
];
const browserOptions = {
  android: [
    { action: "pwa_guide_browser_android_chrome", key: "chrome", label: "Chrome" },
    { action: "pwa_guide_browser_android_samsung", key: "samsung", label: "삼성 브라우저" }
  ],
  ios: [
    { action: "pwa_guide_browser_ios_chrome", key: "chrome", label: "Chrome" },
    { action: "pwa_guide_browser_ios_safari", key: "safari", label: "Safari" }
  ]
};

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

function getInitialBrowser() {
  return /SamsungBrowser/i.test(window.navigator?.userAgent ?? "") ? "samsung" : "chrome";
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
        aria-controls="pwa-guide-platform-panel"
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
        aria-controls="pwa-guide-platform-panel"
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

function BrowserTabs({ browser, onBrowserChange, platform }) {
  const references = useRef({});
  const options = browserOptions[platform];

  function handleKeyDown(event) {
    const currentIndex = options.findIndex((option) => option.key === browser);
    const targetIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (currentIndex + 1) % options.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (currentIndex - 1 + options.length) % options.length
        : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
    if (targetIndex < 0) return;
    event.preventDefault();
    const target = options[targetIndex];
    onBrowserChange(target.key);
    references.current[target.key]?.focus();
  }

  return (
    <div aria-label={`${platform === "ios" ? "iOS" : "Android"} 브라우저 선택`} className="pwa-guide__browser-tabs" role="tablist">
      {options.map((option) => {
        const selected = browser === option.key;
        return <button
          aria-controls="pwa-guide-browser-panel"
          aria-selected={selected}
          className="pwa-guide__browser-tab"
          data-ph-capture-attribute-action={option.action}
          id={`pwa-guide-tab-${platform}-${option.key}`}
          key={option.key}
          onClick={() => onBrowserChange(option.key)}
          onKeyDown={handleKeyDown}
          ref={(element) => { references.current[option.key] = element; }}
          role="tab"
          tabIndex={selected ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>;
      })}
    </div>
  );
}

function Screenshot({ chromeInstallPath, samsungInstallPath, step }) {
  const samsungInstallFocus = step.className === "samsung-install-options"
    ? ` pwa-guide__samsung-focus--${step.className}-${samsungInstallPath}`
    : "";

  return (
    <div className={`pwa-guide__screenshot pwa-guide__screenshot--${step.className}`}>
      <img alt={step.alt} src={step.image} />
      {step.className === "share" ? <span aria-hidden="true" className="pwa-guide__share-focus" /> : null}
      {step.className === "safari-share" ? <>
        <span aria-hidden="true" className="pwa-guide__safari-domain-cover" />
        <span aria-hidden="true" className="pwa-guide__safari-domain">jarihana.com</span>
        <span aria-hidden="true" className="pwa-guide__safari-share-focus" />
      </> : null}
      {step.className === "menu" ? <span aria-hidden="true" className="pwa-guide__menu-focus" /> : null}
      {step.className === "hamburger" ? <span aria-hidden="true" className="pwa-guide__hamburger-focus" /> : null}
      {step.className === "bell" ? <>
        <span aria-hidden="true" className="pwa-guide__bell-badge-cover" />
        <Bell aria-hidden="true" className="pwa-guide__bell-restored" />
        <span aria-hidden="true" className="pwa-guide__bell-focus" />
      </> : null}
      {step.className === "push" ? <span aria-hidden="true" className="pwa-guide__push-focus" /> : null}
      {step.className.startsWith("samsung-") ? <span aria-hidden="true" className={`pwa-guide__samsung-focus pwa-guide__samsung-focus--${step.className}${samsungInstallFocus}`} /> : null}
      {step.className === "android-chrome-menu-install" ? <span aria-hidden="true" className={`pwa-guide__chrome-focus pwa-guide__chrome-focus--${step.className}`} /> : null}
      {step.className === "android-chrome-install-choice" ? <span aria-hidden="true" className={`pwa-guide__chrome-focus pwa-guide__chrome-focus--${step.className} pwa-guide__chrome-focus--${step.className}-${chromeInstallPath}`} /> : null}
    </div>
  );
}

function InstallPathOptions({ ariaLabel, onChange, options, selectedKey }) {
  return (
    <div aria-label={ariaLabel} className="pwa-guide__install-path-options" role="group">
      {options.map((option) => <button
        aria-pressed={selectedKey === option.key}
        className="pwa-guide__install-path-option"
        data-ph-capture-attribute-action={option.action}
        key={option.key}
        onClick={() => onChange(option.key)}
        type="button"
      >
        {option.label}
      </button>)}
    </div>
  );
}

export const PwaInstallGuide = forwardRef(function PwaInstallGuide({ triggerClassName = "" }, reference) {
  const { pathname } = useLocation();
  const { member, sessionVersion = 0, status: authStatus } = useAuth();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(getInitialPlatform);
  const [browser, setBrowser] = useState(getInitialBrowser);
  const [samsungInstallPath, setSamsungInstallPath] = useState("home-screen");
  const [chromeInstallPath, setChromeInstallPath] = useState("install");
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
        setBrowser(getInitialBrowser());
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
    setBrowser(getInitialBrowser());
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
    setBrowser(nextPlatform === "android" ? getInitialBrowser() : "chrome");
    setSamsungInstallPath("home-screen");
    setChromeInstallPath("install");
    setStepIndex(0);
    if (panelReference.current) panelReference.current.scrollTop = 0;
  }

  function changeBrowser(nextBrowser) {
    setBrowser(nextBrowser);
    setSamsungInstallPath("home-screen");
    setChromeInstallPath("install");
    setStepIndex(0);
    if (panelReference.current) panelReference.current.scrollTop = 0;
  }

  function changeStep(nextStep) {
    setStepIndex(nextStep);
    if (panelReference.current) panelReference.current.scrollTop = 0;
  }

  const isIOS = platform === "ios";
  const isSamsungBrowser = platform === "android" && browser === "samsung";
  const isAndroidChrome = platform === "android" && browser === "chrome";
  const samsungInstallSteps = samsungInstallPath === "web-app"
    ? androidSamsungWebAppSteps
    : androidSamsungHomeScreenSteps;
  const chromeInstallSteps = chromeInstallPath === "install"
    ? androidSamsungWebAppSteps
    : androidSamsungHomeScreenSteps;
  const steps = isIOS
    ? browser === "safari" ? iosSafariSteps : iosChromeSteps
    : isSamsungBrowser
      ? [...androidSamsungInstallStart, ...samsungInstallSteps, ...androidSamsungNotificationSteps]
      : isAndroidChrome
        ? [...androidChromeInstallStart, ...chromeInstallSteps, ...androidSamsungNotificationSteps]
      : [];
  const activeStep = steps[stepIndex] ?? null;
  const hasGuide = steps.length > 0;

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
            className="pwa-guide__platform-panel"
            id="pwa-guide-platform-panel"
            role="tabpanel"
          >
            <BrowserTabs browser={browser} onBrowserChange={changeBrowser} platform={platform} />
            <div
              aria-labelledby={`pwa-guide-tab-${platform}-${browser}`}
              className="pwa-guide__panel"
              id="pwa-guide-browser-panel"
              ref={panelReference}
              role="tabpanel"
              tabIndex={0}
            >
              {hasGuide ? <>
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
                  {activeStep.type === "install-path" ? <div className="pwa-guide__install-path">
                    <InstallPathOptions
                      ariaLabel="삼성 브라우저 설치 방법"
                      onChange={setSamsungInstallPath}
                      options={[
                        { action: "pwa_guide_samsung_path_home_screen", key: "home-screen", label: "홈 화면 추가" },
                        { action: "pwa_guide_samsung_path_web_app", key: "web-app", label: "웹 앱으로 설치" }
                      ]}
                      selectedKey={samsungInstallPath}
                    />
                  </div> : null}
                  {activeStep.type === "chrome-install-path" ? <div className="pwa-guide__install-path">
                    <InstallPathOptions
                      ariaLabel="Chrome 설치 방법"
                      onChange={setChromeInstallPath}
                      options={[
                        { action: "pwa_guide_chrome_path_install", key: "install", label: "설치" },
                        { action: "pwa_guide_chrome_path_home_screen", key: "home-screen", label: "홈 화면에 추가" }
                      ]}
                      selectedKey={chromeInstallPath}
                    />
                  </div> : null}
                  <Screenshot chromeInstallPath={chromeInstallPath} samsungInstallPath={samsungInstallPath} step={activeStep} />
                  {activeStep.description && activeStep.type !== "install-path" ? <p className="pwa-guide__step-note">{activeStep.description}</p> : null}
                </section>
              </> : <p className="pwa-guide__coming-soon" role="status">준비중입니다</p>}
            </div>
          </div>
          <footer className="pwa-guide__footer">
            {hasGuide ? <div className="pwa-guide__navigation">
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
