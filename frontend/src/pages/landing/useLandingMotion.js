import { useEffect } from "react";

export function useLandingMotion(pageRef) {
  useEffect(() => {
    const page = pageRef.current;
    if (!page || !window.IntersectionObserver) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reveals = [...page.querySelectorAll("[data-landing-reveal]")];
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12 }
    );

    function syncPreference() {
      reveals.forEach((element) => {
        if (reducedMotion.matches) {
          element.classList.remove("will-reveal");
          element.classList.add("is-revealed");
        } else if (!element.classList.contains("is-revealed")) {
          element.classList.add("will-reveal");
          revealObserver.observe(element);
        }
      });
    }

    syncPreference();
    reducedMotion.addEventListener("change", syncPreference);
    return () => {
      revealObserver.disconnect();
      reducedMotion.removeEventListener("change", syncPreference);
    };
  }, [pageRef]);
}
