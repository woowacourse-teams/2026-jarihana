import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import faviconImage from "../shared/assets/brand/jarihana-favicon.png";
import { storeReturnTarget, useAuth } from "../features/auth";
import { FeedbackForm } from "../features/feedback/index.js";
import { Button, Modal, useToast } from "../shared/ui/index.js";

export function AppFooter() {
  const { login, status } = useAuth();
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const { success } = useToast();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  function handleFeedbackStart(event) {
    if (status === "loading") {
      event.preventDefault();
      return;
    }

    if (status === "authenticated") return;

    event.preventDefault();
    if (status === "signup-required") {
      navigate("/signup");
      return;
    }
    storeReturnTarget(`${pathname}${search}${hash}`);
    login();
  }

  function handleFeedbackSuccess() {
    success({ title: "피드백을 보내드렸어요." });
    setFeedbackOpen(false);
  }

  return (
    <footer aria-labelledby="footer-origin-title" className="app-footer">
      <div className="app-footer__copy">
        <a className="app-footer__brand" href="/">
          <img alt="" className="app-footer__brand-mark" src={faviconImage} />
          <h2 className="app-footer__brand-title">자리 하나?</h2>
        </a>

        <p className="app-footer__tagline">우테코에서 만난 인연들이 함께 만든 자리를 찾아보세요.</p>

        <section aria-labelledby="footer-origin-title" className="app-footer__origin">
          <h2 id="footer-origin-title">왜 &quot;자리&quot;인가?</h2>
          <p>
            우테코 8기 13층에 거주했던 뽀롱마을, 둠바족 사람들은 사람들을 모을 때 &quot;자리하나?&quot;라고 한답니다.
            <br />주로 회식 모임을 구할 때 많이 쓰죠.
          </p>
          <p>
            그걸 변형해서 이 서비스를 통해 동아리나 스터디도
            이젠 사람들을 모을 수 있도록 하기 위해 &quot;자리&quot;라고 하게 되었습니다!
          </p>
        </section>
      </div>

      <div className="app-footer__actions">
        <section aria-labelledby="footer-contact-title" className="app-footer__contact">
          <h2 id="footer-contact-title">Contact us</h2>
          <p>
            <span className="app-footer__contact-intro">
              자리하나를 더 편하게 만들 의견을 들려주세요.
            </span>
            <span className="app-footer__contact-message">
              로그인 후 피드백을 남길 수 있어요.
            </span>
          </p>
          <Modal
            onOpenChange={setFeedbackOpen}
            open={feedbackOpen}
            title="피드백 남기기"
            trigger={
              <Button
                className="app-footer__feedback-button"
                data-ph-capture-attribute-action="feedback_start"
                disabled={status === "loading"}
                onClick={handleFeedbackStart}
                variant="secondary"
              >
                피드백 남기기
              </Button>
            }
          >
            <FeedbackForm onSuccess={handleFeedbackSuccess} />
          </Modal>
        </section>

        <nav aria-label="외부 링크" className="app-footer__social-links">
          <a
            aria-label="레포지토리로 이동"
            className="app-footer__social-link"
            href="https://github.com/woowacourse-teams/2026-jarihana.git"
            rel="noreferrer"
            target="_blank"
          >
            <svg
              aria-hidden="true"
              className="app-footer__repository-icon"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path d="m8 9-3 3 3 3" />
              <path d="m16 9 3 3-3 3" />
              <path d="m14 5-4 14" />
            </svg>
            <span>레포지토리로 이동</span>
            <svg
              aria-hidden="true"
              className="app-footer__repository-arrow"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path d="M5 19 19 5" />
              <path d="M9 5h10v10" />
            </svg>
          </a>
        </nav>
      </div>
    </footer>
  );
}
