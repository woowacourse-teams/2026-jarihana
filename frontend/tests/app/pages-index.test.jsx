import { render, screen } from "@testing-library/react";

import {
  GroupCreatePage,
  GroupMembersManagePage,
  GroupRecruitmentsManagePage,
  NotFoundPage,
  RegistrationManagePage
} from "../../src/pages";

jest.mock("../../src/pages/groups", () => ({}));
jest.mock("../../src/pages/account", () => ({}));
jest.mock("../../src/pages/group-editor", () => ({
  GroupManagePage: () => null,
  NewGroupPage: () => null
}));
jest.mock("../../src/pages/manage", () => ({
  ManageMembersPage: () => null,
  ManageRecruitmentsPage: () => null,
  ManageRegistrationsPage: () => null
}));
jest.mock("../../src/pages/ShowcasePage", () => ({ ShowcasePage: () => null }));

it("aliases lane page names to the public route contract", () => {
  expect(GroupCreatePage).toBeDefined();
  expect(GroupMembersManagePage).toBeDefined();
  expect(GroupRecruitmentsManagePage).toBeDefined();
  expect(RegistrationManagePage).toBeDefined();
});

it("renders a recoverable 404 page", () => {
  // Given / When
  render(<NotFoundPage />);

  // Then
  expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute("href", "/groups");
});
