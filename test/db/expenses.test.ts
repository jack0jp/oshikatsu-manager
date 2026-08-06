import { expect, test } from "vitest";
import { createEvent, createTestUser } from "./helpers";

test("本人はexpensesを作成・閲覧できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await self.client
    .from("expenses")
    .insert({ event_id: event.id, user_id: self.userId, category: "ticket" })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data?.user_id).toBe(self.userId);
});

test("他人のexpensesは見えない", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const { data: created, error: createError } = await self.client
    .from("expenses")
    .insert({ event_id: event.id, user_id: self.userId, category: "ticket" })
    .select()
    .single();
  expect(createError).toBeNull();

  const { data, error } = await stranger.client
    .from("expenses")
    .select()
    .eq("id", created?.id ?? "");
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("他人のexpensesは更新・削除できない", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const { data: created } = await self.client
    .from("expenses")
    .insert({ event_id: event.id, user_id: self.userId, category: "ticket" })
    .select()
    .single();
  const id = created?.id ?? "";

  const { data: updated } = await stranger.client
    .from("expenses")
    .update({ memo: "hijacked" })
    .eq("id", id)
    .select();
  expect(updated).toHaveLength(0);

  // strangerは他人のexpensesをSELECTできないため、RETURNINGが空なだけでは
  // USING句が効いているか分からない。本人視点で実際に変化していないことを確認する。
  const { data: afterUpdate } = await self.client
    .from("expenses")
    .select("memo")
    .eq("id", id)
    .single();
  expect(afterUpdate?.memo).toBeNull();

  const { data: deleted } = await stranger.client.from("expenses").delete().eq("id", id).select();
  expect(deleted).toHaveLength(0);

  const { data: stillExists } = await self.client.from("expenses").select().eq("id", id);
  expect(stillExists).toHaveLength(1);
});

test("本人は自分のexpensesを削除できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const { data: created, error: createError } = await self.client
    .from("expenses")
    .insert({ event_id: event.id, user_id: self.userId, category: "ticket" })
    .select()
    .single();
  expect(createError).toBeNull();
  const id = created?.id ?? "";

  const { error } = await self.client.from("expenses").delete().eq("id", id);
  expect(error).toBeNull();

  const { data: gone } = await self.client.from("expenses").select().eq("id", id);
  expect(gone).toHaveLength(0);
});
