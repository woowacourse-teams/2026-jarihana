require("@testing-library/jest-dom");

const { TextDecoder, TextEncoder } = require("node:util");

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {}
    })
  });
}

if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
  const observers = new Set();

  class IntersectionObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Set();
      observers.add(this);
    }

    observe(element) {
      this.elements.add(element);
    }

    unobserve(element) {
      this.elements.delete(element);
    }

    disconnect() {
      this.elements.clear();
      observers.delete(this);
    }

    takeRecords() {
      return [];
    }
  }

  window.IntersectionObserver = IntersectionObserverMock;
  global.IntersectionObserver = IntersectionObserverMock;

  /** 관찰 중인 요소가 화면에 들어온 것처럼 만들어 무한 스크롤을 검증한다. */
  global.triggerIntersection = (isIntersecting = true) => {
    observers.forEach((observer) => {
      const entries = [...observer.elements].map((target) => ({ isIntersecting, target }));
      if (entries.length) {
        observer.callback(entries, observer);
      }
    });
  };
}

if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    constructor() {}

    observe() {}

    unobserve() {}

    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock;
  global.ResizeObserver = ResizeObserverMock;
}
