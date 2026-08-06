import { expect, test } from "vitest";
import { createEvent, createTestUser } from "./helpers";

test("未削除のイベントは無関係のユーザーも閲覧できる", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await stranger.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});

test("無関係のユーザーは他人のイベントを編集できない", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await stranger.client
    .from("events")
    .update({ title: "hijacked" })
    .eq("id", event.id)
    .select();
  expect(error).toBeNull();
  expect(data).toHaveLength(0);

  const { data: unchanged } = await owner.client
    .from("events")
    .select("title")
    .eq("id", event.id)
    .single();
  expect(unchanged?.title).toBe("test event");
});

test("他人になりすましてイベントを登録できない", async () => {
  const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  const { error } = await userA.client.from("events").insert({
    owner_id: userB.userId,
    genre: "idol",
    title: "spoofed",
    starts_at: new Date().toISOString(),
  });
  expect(error).not.toBeNull();
});

test("参加者(公開)がいるイベントはオーナーでも削除できない", async () => {
  const [owner, participant] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  await participant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: participant.userId,
    status: "considering",
    visibility: "public",
  });

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).not.toBeNull();
});

test("参加者(非公開)がいるイベントはオーナーでも削除できない", async () => {
  const [owner, participant] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  // visibilityを指定しないとdefaultのprivateになる
  await participant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: participant.userId,
    status: "considering",
  });

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).not.toBeNull();
});

test("参加者がオーナー以外にいなければ削除できる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).toBeNull();
});

test("削除後もオーナー自身は引き続き閲覧できる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);

  const { data, error } = await owner.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});

test("削除後は無関係のユーザーから見えなくなる", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);

  const { data, error } = await stranger.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("削除後も自分の支出が紐づくユーザーは引き続き閲覧できる", async () => {
  const [owner, spender] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  await spender.client.from("expenses").insert({
    user_id: spender.userId,
    event_id: event.id,
    category: "ticket",
  });
  await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);

  const { data, error } = await spender.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});
