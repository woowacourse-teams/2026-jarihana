import { expect, test } from "playwright/test";
import seeds from "../fixtures/clubhouse-seeds.cjs";
import { group, installApiFixture } from "./api-fixture.js";

test("a saved v9 room keeps a retired sofa across an edit and reload", { tag: "@core" }, async ({ page }) => {
  test.setTimeout(150_000);
  const retired = { ...seeds.furnitureCatalog.find(item => item.kind === "sofa"), name: "보관 소파", placeable: false };
  const table = seeds.furnitureCatalog.find(item => item.kind === "table");
  await installApiFixture(page, { furnitureCatalog: [retired, table] });
  const items = [{ id: "original-sofa", kind: retired.kind, x: 2.25, z: -9, rotation: 3, level: 1,
    color: "#abc123", finish: "fabric", variant: 2, scaleX: 1.25, scaleY: 0.9, scaleZ: 1, elevation: 0.25,
    title: "첫 모임", note: "예전에 남긴 메모" }];
  let snapshot = {
    room: { ...seeds.blueprint("study").defaultRoom, name: "기존 방", version: 9, template: "study", items },
    revision: 4, updatedAt: "2026-08-21T19:00:00", canEdit: true,
    ...seeds.blueprint("study", 9)
  };
  let saved;
  await page.route(`**/api/groups/${group.id}/space`, async route => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      snapshot = { ...snapshot, room: saved.room, revision: snapshot.revision + 1 };
    }
    await route.fulfill({ json: { success: true, data: snapshot, error: null } });
  });

  async function openEditor() {
    await page.getByRole("button", { name: "꾸미기", exact: true }).click({ timeout: 90_000 });
    await page.locator('[data-ph-capture-attribute-action="space_inventory_toggle"]').click();
    await expect(page.getByRole("button", { name: "보관 소파 1" })).toBeVisible();
    await page.locator('[data-ph-capture-attribute-action="space_inventory_toggle"]').click();
    await page.getByRole("button", { name: "메뉴 펼치기" }).click();
  }

  await page.goto(`/groups/${group.id}/space`);
  await openEditor();
  const tools = page.getByRole("navigation", { name: "꾸미기 도구" });
  await tools.getByRole("button", { name: "가구", exact: true }).click();
  await expect(page.getByRole("button", { name: "보관 소파 추가" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `${table.name} 추가` })).toBeVisible();
  await tools.getByRole("button", { name: "내 자리", exact: true }).click();
  await page.getByRole("textbox", { name: "공간 이름" }).fill("수정한 방");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(() => saved?.expectedRevision).toBe(4);
  expect(saved.room).toMatchObject({ name: "수정한 방", version: 9 });
  expect(saved.room.items).toEqual(items);
  expect(saved.blueprintRef).toEqual(snapshot.blueprintRef);
  await expect(page.getByRole("button", { name: "저장", exact: true })).not.toHaveAttribute("data-unsaved", "true");
  await page.reload();
  await openEditor();
  await tools.getByRole("button", { name: "내 자리", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "공간 이름" })).toHaveValue("수정한 방");
});
