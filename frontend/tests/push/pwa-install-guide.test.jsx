import { fireEvent, render, screen } from "@testing-library/react";

import { PwaInstallGuide } from "../../src/features/push/PwaInstallGuide.jsx";

jest.mock("react-router", () => ({
  useLocation: () => ({ pathname: "/settings" })
}));
jest.mock("../../src/features/auth", () => ({
  useAuth: () => ({ member: null, sessionVersion: 0, status: "anonymous" })
}));
jest.mock("../../src/features/push/api", () => ({
  hasActivePushSubscription: jest.fn()
}));

test("loads guide images from the public S3 guide assets", () => {
  render(<PwaInstallGuide />);

  fireEvent.click(screen.getByRole("button", { name: "설치 안내 보기" }));

  expect(screen.getByRole("img", { name: "Chrome 주소창 오른쪽의 공유 버튼" }))
    .toHaveAttribute("src", "https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/jarihana-dev/images/push-guide/ios-pwa-guide/safari-share.jpeg");
});
