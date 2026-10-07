// Webpack 개발 서버에서만 사용하는 읽기 전용 사진 기록이다.
// 사진 출처와 URL 형식: https://picsum.photos/
const groups = [
  { id: 900001, name: "함께 코딩하는 스터디", type: "STUDY", status: "ACTIVE" },
  { id: 900002, name: "주말 산책 동아리", type: "CLUB", status: "ACTIVE" },
  { id: 900003, name: "커피 한 잔 같이해요", type: "SESSION", status: "ACTIVE" },
  { id: 900004, name: "지난 계절의 사진 모임", type: "CLUB", status: "ENDED" }
].map((group) => ({ ...group, recruiting: false, joined: false }));

// 가로, 세로, 정사각형 사진을 섞어 Masonry와 크게 보기를 확인한다.
const photos = [
  {
    group: 0,
    photo: 180,
    width: 1000,
    height: 667,
    caption: "오늘도 함께 코딩하며 한 걸음 성장했어요."
  },
  {
    group: 1,
    photo: 1011,
    width: 750,
    height: 1000,
    caption: "주말에는 잠시 화면을 떠나 걸어 봤어요."
  },
  {
    group: 2,
    photo: 1060,
    width: 900,
    height: 900,
    caption: "커피 한 잔과 함께 나눈 프로젝트 이야기."
  },
  { group: 0, photo: 24, width: 900, height: 600, caption: "책을 읽고 서로의 생각을 나눴어요." },
  { group: 1, photo: 1036, width: 700, height: 1000, caption: "산책길에서 만난 멋진 풍경." },
  { group: 2, photo: 225, width: 900, height: 675, caption: "쉬어 가는 시간도 함께하면 즐거워요." },
  {
    group: 0,
    photo: 119,
    width: 1000,
    height: 600,
    caption: "각자의 코드를 공유한 짧은 발표 시간."
  },
  { group: 1, photo: 1043, width: 900, height: 900, caption: "처음 걷는 길에서 발견한 작은 순간." },
  { group: 2, photo: 292, width: 750, height: 1000, caption: "다음 모임을 기약하며 남긴 한 장." },
  { group: 3, photo: 1039, width: 1000, height: 667, caption: "지금은 끝난 모임, 오래 남을 풍경." },
  { group: 3, photo: 1015, width: 700, height: 1000, caption: "함께 여행하며 담았던 지난 계절." },
  { group: 3, photo: 1025, width: 900, height: 900, caption: null }
];

const commentContents = [
  [
    "함께하니 더 즐거웠어요!",
    "다음 모임도 기대돼요.",
    "막혔던 부분을 같이 풀어서 많이 배웠어요.",
    "오늘 정리한 내용도 공유해 주세요!",
    "사진 보니까 다시 모여서 코딩하고 싶네요."
  ],
  [
    "풍경이 정말 멋지네요. 다음 산책도 참여하고 싶어요!",
    "천천히 걸으면서 이야기 나눈 시간이 좋았어요.",
    "다음에는 다른 코스도 같이 걸어 봐요."
  ],
  [
    "커피 마시면서 편하게 이야기할 수 있어서 좋았어요.",
    "추천해 주신 메뉴 맛있었어요!",
    "다음에는 디저트도 같이 먹어요."
  ],
  [
    "같은 책을 읽어도 서로 눈여겨본 부분이 다르네요.",
    "오늘 추천받은 책도 읽어 보려고요.",
    "다음 독서 모임에는 질문을 더 준비해 갈게요."
  ],
  [
    "이 풍경을 직접 봤다니 부러워요!",
    "조금 힘들었지만 올라간 보람이 있었어요.",
    "다음에는 간식도 챙겨서 함께 가요."
  ],
  [
    "잠깐 쉬면서 이야기하니까 머리가 맑아졌어요.",
    "함께 쉬어 가는 이런 시간이 꼭 필요한 것 같아요.",
    "다음 모임도 부담 없이 같이해요."
  ],
  [
    "다른 분들의 코드와 접근 방법을 볼 수 있어서 좋았어요.",
    "발표 자료를 다시 보면서 정리하고 있어요.",
    "다음 발표 때는 저도 경험을 나눠 볼게요!"
  ],
  [
    "익숙한 동네에서도 새로운 길을 발견했네요.",
    "사진으로 보니 그날 분위기가 다시 떠올라요.",
    "날씨 좋은 날에 또 걸어요!"
  ],
  [
    "짧은 시간이었지만 이야기 나눌 수 있어서 좋았어요.",
    "다음에도 시간 맞춰서 참여할게요.",
    "모임 준비해 주셔서 감사합니다!"
  ],
  [
    "모임은 끝났지만 사진이 남아 있어서 좋네요.",
    "이날 함께 봤던 풍경이 아직 기억나요.",
    "기회가 되면 다시 모여요!"
  ],
  [
    "지난 계절의 여행이 벌써 그립네요.",
    "함께 찍었던 다른 사진도 찾아볼게요.",
    "오래 기억에 남을 하루였어요."
  ],
  [
    "마지막 사진까지 보니 앨범을 다시 펼친 기분이에요.",
    "귀여운 순간을 잘 담아 주셨네요!",
    "좋은 기억을 남겨 주셔서 감사합니다."
  ]
];

const commentsByPostId = new Map(
  commentContents.map((contents, postIndex) => [
    910012 - postIndex,
    contents.map((content, commentIndex) => ({
      id: 920001 + postIndex * 10 + commentIndex,
      authorNickname: ["하나", "두리", "보름", "나루"][commentIndex % 4],
      content,
      createdAt: `2026-10-${String(7 - Math.floor(postIndex / 2)).padStart(2, "0")}T10:${String((commentIndex + 1) * 10).padStart(2, "0")}:00`,
      canDelete: false,
      reactions: commentIndex === 0 ? [{ emoji: "HEART", count: 2, reacted: false }] : []
    }))
  ])
);
const comments = [...commentsByPostId.values()].flat();

const leader = {
  memberId: 930001,
  crewName: "자리",
  memberType: "CREW",
  generation: 8
};

export const activityPostDemoPosts = photos.map((photo, index) => ({
  id: 910012 - index,
  group: groups[photo.group],
  authorNickname: ["자리", "하나", "두리"][index % 3],
  imageUrl: `https://picsum.photos/id/${photo.photo}/${photo.width}/${photo.height}`,
  caption: photo.caption,
  activityDate: `2026-10-${String(7 - Math.floor(index / 2)).padStart(2, "0")}`,
  createdAt: `2026-10-${String(7 - Math.floor(index / 2)).padStart(2, "0")}T10:00:00`,
  canModify: false,
  commentCount: commentsByPostId.get(910012 - index).length,
  reactions:
    index % 3 === 0
      ? [
          { emoji: "THUMBS_UP", count: index + 2, reacted: false },
          { emoji: "FIRE", count: 1, reacted: false }
        ]
      : []
}));

function send(response, data, status = 200, code = null) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json({ success: status < 400, data, error: code ? { code } : null });
}

function sendPage(request, response, items) {
  const size = Number(request.query.size ?? 20);
  const offset = Number(request.query.cursor ?? 0);
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    send(response, null, 400, "INVALID_REQUEST");
    return;
  }
  const end = offset + size;
  const hasNext = end < items.length;
  send(response, {
    items: items.slice(offset, end),
    hasNext,
    nextCursor: hasNext ? String(end) : null
  });
}

function groupDetail(group) {
  return {
    ...group,
    introduction: "사진 활동 기록 화면을 확인하기 위한 로컬 예시 모임입니다.",
    description: "개발 서버에서만 보이는 가짜 데이터입니다.",
    representativeImageUrl: activityPostDemoPosts.find((post) => post.group.id === group.id)
      .imageUrl,
    meetingType: "FLEXIBLE",
    location: null,
    leader,
    memberCount: 1,
    activeRecruitment: null,
    recurringSchedule: null,
    sessionSchedule: null,
    currentMemberRole: null,
    createdAt: "2026-10-01T10:00:00"
  };
}

export function activityPostDemoMiddleware(request, response, next) {
  // 백엔드 없이도 공개 사진을 볼 수 있도록 비로그인 상태로 시작한다.
  if (
    (request.path === "/api/members/me" && request.method === "GET") ||
    (request.path === "/api/auth/refresh" && request.method === "POST")
  ) {
    send(response, null, 401, "UNAUTHENTICATED");
    return;
  }

  const groupPath = request.path.match(
    /^\/api\/groups\/(\d+)(?:\/(activity-posts|members|recruitments))?\/?$/
  );
  const group = groupPath && groups.find((item) => item.id === Number(groupPath[1]));
  const postPath = request.path.match(
    /^\/api\/activity-posts\/(\d+)(?:\/(comments|reactions\/[^/]+))?\/?$/
  );
  const post = postPath && activityPostDemoPosts.find((item) => item.id === Number(postPath[1]));
  const commentPath = request.path.match(
    /^\/api\/activity-post-comments\/(\d+)(?:\/reactions\/[^/]+)?\/?$/
  );
  const comment = commentPath && comments.find((item) => item.id === Number(commentPath[1]));
  const isGlobalFeed = request.path === "/api/activity-posts";
  if (!isGlobalFeed && !group && !post && !comment) {
    next();
    return;
  }
  if (request.method !== "GET") {
    send(response, null, 405, "METHOD_NOT_ALLOWED");
    return;
  }
  if (isGlobalFeed || groupPath?.[2] === "activity-posts") {
    const items =
      request.query.mine === "true"
        ? []
        : activityPostDemoPosts.filter((item) => !group || item.group.id === group.id);
    sendPage(request, response, items);
  } else if (postPath?.[2] === "comments") {
    sendPage(request, response, commentsByPostId.get(post.id) ?? []);
  } else if (group && !groupPath[2]) {
    send(response, groupDetail(group));
  } else if (groupPath?.[2] === "members") {
    sendPage(request, response, [
      {
        ...leader,
        groupMemberId: group.id,
        course: "FRONTEND",
        role: "LEADER",
        joinedAt: "2026-10-01T10:00:00"
      }
    ]);
  } else if (group) {
    sendPage(request, response, []);
  } else {
    send(response, null, 404, "NOT_FOUND");
  }
}
