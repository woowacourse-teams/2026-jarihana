import { routeRegistry } from "../../src/app/routes";

it("registers every public, member, leader, showcase, and fallback route", () => {
  // Given
  const expectedPaths = [
    "/",
    "/groups",
    "/groups/:groupId",
    "/groups/:groupId/recruitments/:recruitmentId",
    "/oauth/callback",
    "/signup",
    "/my",
    "/my/groups",
    "/my/registrations",
    "/groups/new",
    "/groups/:groupId/manage",
    "/groups/:groupId/manage/members",
    "/groups/:groupId/manage/recruitments",
    "/groups/:groupId/manage/recruitments/:recruitmentId/registrations",
    "/__showcase",
    "*"
  ];

  // When
  const paths = routeRegistry.map((route) => route.path);

  // Then
  expect(paths).toEqual(expectedPaths);
});

it("marks route authority without relying on path-prefix guesses", () => {
  // Given
  const routeByPath = new Map(routeRegistry.map((route) => [route.path, route.access]));

  // When
  const memberAccess = routeByPath.get("/groups/new");
  const leaderAccess = routeByPath.get("/groups/:groupId/manage/members");

  // Then
  expect(memberAccess).toBe("member");
  expect(leaderAccess).toBe("leader");
});
