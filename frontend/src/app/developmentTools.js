export function shouldLoadDevelopmentTools(environment, disabled) {
  return environment === "development" && disabled !== "1";
}

const loadReactGrab = () => import("react-grab");
const loadReactScan = () => import("react-scan/lite");

export async function enableDevelopmentTools({
  disabled = process.env.DISABLE_REACT_DEVTOOLS,
  environment = process.env.NODE_ENV,
  loadGrab = loadReactGrab,
  loadScan = loadReactScan
} = {}) {
  if (!shouldLoadDevelopmentTools(environment, disabled)) {
    return [];
  }

  const results = await Promise.allSettled([
    loadGrab(),
    loadScan().then((module) => module.instrument())
  ]);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("React 개발 도구를 시작하지 못했습니다.", result.reason);
    }
  });
  return results;
}
