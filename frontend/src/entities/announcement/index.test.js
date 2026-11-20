import { announcementDetailSchema, announcementListPageSchema } from "./index.js";

const summary = {
  id: 101,
  title: "모임 공지",
  scope: "MEMBERS",
  authorNickname: "자리",
  createdAt: "2026-11-04T10:00:00"
};

test("목록은 관리 권한 필드가 없는 서버 요약 응답을 읽는다", () => {
  const page = { items: [summary], nextCursor: null, hasNext: false };
  expect(announcementListPageSchema.parse(page)).toEqual(page);
});

test.each([true, false])("상세는 서버의 관리 권한 %s를 보존한다", (canManage) => {
  const detail = { ...summary, content: "공지 본문", canManage };
  expect(announcementDetailSchema.parse(detail)).toEqual(detail);
});

test("구버전 서버의 상세는 관리 권한 없이 읽을 수 있다", () => {
  const detail = { ...summary, content: "공지 본문" };
  expect(announcementDetailSchema.parse(detail)).toEqual({ ...detail, canManage: false });
});
