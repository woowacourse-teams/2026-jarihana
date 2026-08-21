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
