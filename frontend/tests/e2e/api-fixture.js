const now = "2026-08-21T19:00:00";
const later = "2026-09-21T19:00:00";

export const leader = {
  avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  course: "FRONTEND",
  crewName: "자리",
  generation: 8,
  id: 1,
  memberType: "CREW"
};

const member = {
  avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
  course: "BACKEND",
  crewName: "하나",
  generation: 8,
  id: 2,
  memberType: "CREW"
};

const members = [
  leader,
  member,
  {
    avatarUrl: "https://avatars.githubusercontent.com/u/3?v=4",
    course: "ANDROID",
    crewName: "두리",
    generation: 7,
    id: 3,
    memberType: "CREW"
  },
  {
    avatarUrl: "https://avatars.githubusercontent.com/u/4?v=4",
    course: "FRONTEND",
    crewName: "보름",
    generation: 9,
    id: 4,
    memberType: "CREW"
  },
  {
    avatarUrl: "https://avatars.githubusercontent.com/u/5?v=4",
    course: "BACKEND",
    crewName: "여름",
    generation: 6,
    id: 5,
    memberType: "CREW"
  }
];

const leaderSummary = {
  avatarUrl: leader.avatarUrl,
  crewName: leader.crewName,
  generation: leader.generation,
  memberId: 1,
  memberType: "CREW"
};

export const group = {
  activeRecruitment: {
    approvedCount: 3,
    capacity: 10,
    endsAt: later,
    id: 20,
    joinMethod: "APPROVAL",
    startsAt: now
  },
  createdAt: "2026-08-01T12:00:00",
  description: "서로의 구현을 리뷰하며 오래 가는 프론트엔드 기초를 다집니다.",
  id: 10,
  introduction: "천천히 깊게 배우는 프론트엔드 스터디",
  leader: leaderSummary,
  memberCount: 2,
  meetingType: "OFFLINE",
  name: "프론트엔드 한 자리",
  location: "강남역",
  recurringSchedule: {
    daysOfWeek: ["THURSDAY"],
    endTime: "21:00",
    startTime: "19:00"
  },
  representativeImageUrl: null,
  sessionSchedule: null,
  status: "ACTIVE",
  type: "STUDY"
};

const groups = [
  group,
  {
    activeRecruitment: null,
    id: 11,
    introduction: "사이드 프로젝트를 함께 완주하는 주말 모임",
    leader: { crewName: "두리", generation: 7, memberId: 3, memberType: "CREW" },
    memberCount: 9,
    name: "주말 메이커 클럽",
    representativeImageUrl: "/images/maker-club.svg",
    status: "ACTIVE",
    type: "CLUB"
  },
  {
    activeRecruitment: {
      approvedCount: 12,
      capacity: 16,
      endsAt: "2026-09-05T18:00:00",
      id: 22,
      joinMethod: "AUTO",
      startsAt: "2026-08-28T09:00:00"
    },
    id: 12,
    introduction: "접근성 실무 사례를 나누는 한 번의 집중 세션",
    leader: { crewName: "보름", generation: 9, memberId: 4, memberType: "CREW" },
    memberCount: 12,
    name: "웹 접근성 실전 세션",
    representativeImageUrl: "/images/accessibility-session.svg",
    status: "ACTIVE",
    type: "SESSION"
  }
];

export const recruitment = {
  approvedCount: 3,
  capacity: 10,
  createdAt: "2026-08-01T12:00:00",
  endsAt: later,
  group: { id: group.id, name: group.name, status: "ACTIVE" },
  id: 20,
  joinMethod: "APPROVAL",
  recruitingStatus: "OPEN",
  remainingSeats: 7,
  startsAt: now
};

export const pendingRegistration = {
  decidedAt: null,
  decidedBy: null,
  decisionReason: null,
  id: 40,
  member,
  message: "함께 성장하고 싶습니다.",
  registeredAt: "2026-08-10T12:00:00",
  status: "PENDING"
};

const registrations = [
  pendingRegistration,
  {
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
    id: 41,
    member: members[2],
    message: "안드로이드 경험을 나누며 웹도 배우고 싶어요.",
    registeredAt: "2026-08-11T09:30:00",
    status: "PENDING"
  },
  {
    decidedAt: "2026-08-13T14:00:00",
    decidedBy: { memberId: leader.id, type: "MEMBER" },
    decisionReason: null,
    id: 42,
    member: members[3],
    message: "접근성까지 꼼꼼하게 리뷰하는 팀을 찾고 있습니다.",
    registeredAt: "2026-08-12T16:20:00",
    status: "APPROVED"
  },
  {
    decidedAt: "2026-08-15T11:00:00",
    decidedBy: { memberId: leader.id, type: "MEMBER" },
    decisionReason: "이번 기수의 정원이 모두 찼습니다.",
    id: 43,
    member: members[4],
    message: "백엔드 관점의 피드백으로 함께 성장하고 싶습니다.",
    registeredAt: "2026-08-14T10:00:00",
    status: "REJECTED"
  }
];

const groupMember = (value, role, groupMemberId) => ({
  avatarUrl: value.avatarUrl,
  course: value.course,
  crewName: value.crewName,
  generation: value.generation,
  groupMemberId,
  joinedAt: "2026-08-02T12:00:00",
  memberId: value.id,
  memberType: value.memberType,
  role
});

const myRegistration = {
  ...pendingRegistration,
  group: { id: group.id, name: group.name, representativeImageUrl: group.representativeImageUrl },
  recruitmentId: recruitment.id
};
delete myRegistration.member;

const recruitmentItems = [
  {
    approvedCount: recruitment.approvedCount,
    capacity: recruitment.capacity,
    createdAt: recruitment.createdAt,
    endsAt: recruitment.endsAt,
    id: recruitment.id,
    joinMethod: recruitment.joinMethod,
    recruitingStatus: recruitment.recruitingStatus,
    startsAt: recruitment.startsAt
  },
  {
    approvedCount: 0,
    capacity: 6,
    createdAt: "2026-08-12T08:00:00",
    endsAt: "2026-10-01T18:00:00",
    id: 21,
    joinMethod: "AUTO",
    recruitingStatus: "SCHEDULED",
    startsAt: "2026-09-10T09:00:00"
  },
  {
    approvedCount: 8,
    capacity: 8,
    createdAt: "2026-07-01T12:00:00",
    endsAt: "2026-08-01T18:00:00",
    id: 23,
    joinMethod: "APPROVAL",
    recruitingStatus: "CLOSED",
    startsAt: "2026-07-05T09:00:00"
  }
];

const page = (items, nextCursor = null) => ({ hasNext: Boolean(nextCursor), items, nextCursor });
const success = (data) => ({ data, error: null, success: true });
const failure = (code) => ({ data: null, error: { code }, success: false });

function json(route, data, status = 200) {
  return route.fulfill({
    body: JSON.stringify(data),
    contentType: "application/json",
    status
  });
}

function match(pathname, pattern) {
  const expression = new RegExp(`^${pattern.replaceAll(/:\w+/g, "([^/]+)")}$`);
  return pathname.match(expression);
}

export async function installApiFixture(pageInstance, options = {}) {
  const state = {
    auth: options.auth ?? "authenticated",
    errorPath: options.errorPath ?? null,
    errorStatus: options.errorStatus ?? null,
    registrationPresent: true,
    unexpectedResponses: [],
    requests: []
  };

  pageInstance.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 400) {
      const expectedAuthFailure =
        state.auth === "anonymous" &&
        ["/api/members/me", "/api/auth/refresh"].includes(url.pathname) &&
        response.status() === 401;
      const expectedInjectedFailure =
        state.errorPath &&
        url.pathname === state.errorPath &&
        response.status() === state.errorStatus;
      if (!expectedAuthFailure && !expectedInjectedFailure) {
        state.unexpectedResponses.push(`${response.status()} ${url.pathname}`);
      }
    }
  });

  await pageInstance.route("https://github.com/login/oauth/authorize**", (route) =>
    route.fulfill({
      body: "<!doctype html><title>Stub GitHub OAuth</title><h1>Stub GitHub OAuth</h1>",
      contentType: "text/html"
    })
  );

  await pageInstance.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ body: "", contentType: "text/css" })
  );

  await pageInstance.route("**/images/**", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dff8f3"/></svg>',
      contentType: "image/svg+xml"
    })
  );

  await pageInstance.route("https://avatars.githubusercontent.com/**", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="48" fill="#18b6b1"/><circle cx="48" cy="40" r="16" fill="#062321"/><path d="M20 82c4-18 18-28 28-28s24 10 28 28" fill="#062321"/></svg>',
      contentType: "image/svg+xml"
    })
  );

  await pageInstance.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    const method = request.method();
    state.requests.push({ method, path, postData: request.postDataJSON?.() });

    if (path.startsWith("/images/") && method === "GET") {
      return route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dff8f3"/></svg>',
        contentType: "image/svg+xml"
      });
    }

    if (state.errorPath === url.pathname) {
      if (state.errorStatus === 0) return route.abort("connectionfailed");
      return json(
        route,
        failure(state.errorStatus === 403 ? "FORBIDDEN" : "NOT_FOUND"),
        state.errorStatus
      );
    }

    if (path === "/members/me" && method === "GET") {
      if (state.auth === "anonymous") return json(route, failure("UNAUTHENTICATED"), 401);
      if (state.auth === "signup-required") {
        return json(route, success({ member: null, signupCompleted: false }));
      }
      return json(route, success({ member: leader, signupCompleted: true }));
    }
    if (path === "/auth/refresh" && method === "POST") {
      return state.auth === "anonymous"
        ? json(route, failure("UNAUTHENTICATED"), 401)
        : json(route, success({ expiresIn: 1800 }));
    }
    if (path === "/auth/logout" && method === "POST") {
      state.auth = "anonymous";
      return route.fulfill({ status: 204 });
    }
    if (path === "/members" && method === "POST") {
      state.auth = "authenticated";
      return json(
        route,
        success({
          course: leader.course,
          crewName: leader.crewName,
          generation: leader.generation,
          id: leader.id,
          joinedAt: now,
          memberType: "CREW"
        })
      );
    }

    if (path === "/groups" && method === "GET") return json(route, success(page(groups)));
    if (path === "/groups" && method === "POST") {
      return json(route, success({ id: group.id, status: "ACTIVE" }), 201);
    }
    if (match(path, "/groups/:groupId") && method === "GET") return json(route, success(group));
    if (match(path, "/groups/:groupId") && method === "PUT") return json(route, success(group));
    if (match(path, "/groups/:groupId") && method === "DELETE")
      return route.fulfill({ status: 204 });
    if (match(path, "/groups/:groupId") && method === "PATCH") {
      return json(route, success({ id: group.id, status: "ENDED", updatedAt: now }));
    }
    if (match(path, "/groups/:groupId/recurring-schedule") && method === "PUT") {
      return json(route, success(group.recurringSchedule));
    }
    if (match(path, "/groups/:groupId/recurring-schedule") && method === "DELETE") {
      return route.fulfill({ status: 204 });
    }
    if (match(path, "/groups/:groupId/session-schedule") && method === "PUT") {
      return json(
        route,
        success({ endTime: "21:00", sessionDate: "2026-09-01", startTime: "19:00" })
      );
    }
    if (match(path, "/groups/:groupId/members") && method === "GET") {
      return json(
        route,
        success(
          page([
            groupMember(members[0], "LEADER", 101),
            groupMember(members[1], "MEMBER", 102),
            groupMember(members[2], "MEMBER", 103),
            groupMember(members[3], "MEMBER", 104),
            groupMember(members[4], "MEMBER", 105)
          ])
        )
      );
    }
    if (match(path, "/groups/:groupId/leader") && method === "PUT") {
      return json(
        route,
        success({ groupId: group.id, leaderGroupMemberId: 102, previousLeaderGroupMemberId: 101 })
      );
    }
    if (match(path, "/groups/:groupId/recruitments") && method === "GET") {
      return json(route, success(page(recruitmentItems)));
    }
    if (match(path, "/groups/:groupId/recruitments") && method === "POST") {
      const body = request.postDataJSON();
      return json(
        route,
        success({
          capacity: body.capacity,
          endsAt: body.endsAt ?? null,
          groupId: group.id,
          id: 21,
          joinMethod: body.joinMethod,
          recruitingStatus: "SCHEDULED",
          startsAt: body.startsAt
        }),
        201
      );
    }
    if (match(path, "/groups/:groupId/recruitments/:recruitmentId") && method === "GET") {
      return json(route, success(recruitment));
    }
    if (match(path, "/groups/:groupId/recruitments/:recruitmentId") && method === "PATCH") {
      return json(route, success({ endsAt: now, id: recruitment.id, recruitingStatus: "CLOSED" }));
    }
    if (match(path, "/recruitments/:recruitmentId/registrations") && method === "GET") {
      return json(
        route,
        success(page(registrations.filter((item) => state.registrationPresent || item.id !== 40)))
      );
    }
    if (match(path, "/recruitments/:recruitmentId/registrations") && method === "POST") {
      return json(
        route,
        success({ decidedAt: null, decidedBy: null, id: 41, registeredAt: now, status: "PENDING" }),
        201
      );
    }
    if (
      match(path, "/recruitments/:recruitmentId/registrations/:registrationId") &&
      method === "DELETE"
    ) {
      state.registrationPresent = false;
      return route.fulfill({ status: 204 });
    }
    if (
      match(path, "/recruitments/:recruitmentId/registrations/:registrationId") &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON();
      return json(
        route,
        success({
          decidedAt: now,
          decidedBy: { memberId: leader.id, type: "MEMBER" },
          decisionReason: body.decisionReason ?? null,
          id: pendingRegistration.id,
          status: body.status
        })
      );
    }
    if (path === "/registrations" && method === "GET") {
      return json(route, success(page(state.registrationPresent ? [myRegistration] : [])));
    }

    state.unexpectedResponses.push(`UNHANDLED ${method} ${path}`);
    return json(route, failure("NOT_FOUND"), 404);
  });

  return state;
}
