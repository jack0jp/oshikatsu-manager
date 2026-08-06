import { expect, test } from "vitest";
import { createEvent, createTestUser } from "./helpers";

test("本人はticket_entriesを作成・閲覧できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await self.client
    .from("ticket_entries")
    .insert({ event_id: event.id, user_id: self.userId, entry_type: "lottery" })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data?.user_id).toBe(self.userId);
});

test("他人のticket_entriesは見えない", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const { data: created, error: createError } = await self.client
    .from("ticket_entries")
    .insert({ event_id: event.id, user_id: self.userId, entry_type: "lottery" })
    .select()
    .single();
  expect(createError).toBeNull();

  const { data, error } = await stranger.client
    .from("ticket_entries")
    .select()
    .eq("id", created?.id ?? "");
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("他人のticket_entriesは更新・削除できない", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const { data: created, error: createError } = await self.client
    .from("ticket_entries")
    .insert({ event_id: event.id, user_id: self.userId, entry_type: "lottery" })
    .select()
    .single();
  expect(createError).toBeNull();
  const id = created?.id ?? "";

  const { data: updated } = await stranger.client
    .from("ticket_entries")
    .update({ provider: "hijacked" })
    .eq("id", id)
    .select();
  expect(updated).toHaveLength(0);

  // strangerは他人のticket_entriesをSELECTできないため、RETURNINGが空なだけでは
  // USING句が効いているか分からない。本人視点で実際に変化していないことを確認する。
  const { data: afterUpdate } = await self.client
    .from("ticket_entries")
    .select("provider")
    .eq("id", id)
    .single();
  expect(afterUpdate?.provider).toBeNull();

  const { data: deleted } = await stranger.client
    .from("ticket_entries")
    .delete()
    .eq("id", id)
    .select();
  expect(deleted).toHaveLength(0);

  const { data: stillExists } = await self.client.from("ticket_entries").select().eq("id", id);
  expect(stillExists).toHaveLength(1);
});

test("本人は自分のticket_entriesを削除できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const { data: created, error: createError } = await self.client
    .from("ticket_entries")
    .insert({ event_id: event.id, user_id: self.userId, entry_type: "lottery" })
    .select()
    .single();
  expect(createError).toBeNull();
  const id = created?.id ?? "";

  const { error } = await self.client.from("ticket_entries").delete().eq("id", id);
  expect(error).toBeNull();

  const { data: gone } = await self.client.from("ticket_entries").select().eq("id", id);
  expect(gone).toHaveLength(0);
});
