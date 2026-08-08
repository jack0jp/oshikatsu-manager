import { expect, test } from "vitest";
import { createEvent, createTestUser, softDeleteEvent } from "./helpers";

test("自分で参加登録できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await self.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: self.userId, status: "considering" })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data?.visibility).toBe("private");
});

test("他人になりすまして参加登録できない", async () => {
  const [owner, actor, victim] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);

  const { error } = await actor.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: victim.userId, status: "considering" });
  expect(error).not.toBeNull();
});

test("参加登録済みユーザーは他人を招待でき、招待された行はprivate/joinedに固定される", async () => {
  const [owner, inviter, invitee] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await inviter.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: inviter.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  // 招待INSERT自体はRETURNINGしない。招待者(inviter)はinvitee宛ての非公開行を
  // SELECTポリシー上読めない(user_id=invitee, visibility=private)ため、
  // INSERT ... RETURNINGがRLSに阻まれてしまう(招待者が読めないのは意図通りの挙動)。
  const { error } = await inviter.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: inviter.userId,
    status: "considering",
  });
  expect(error).toBeNull();

  // 作成された行の中身は、招待された本人(invitee)の視点で確認する。
  const { data } = await invitee.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", invitee.userId)
    .single();
  expect(data?.visibility).toBe("private");
  expect(data?.participation_state).toBe("joined");
});

test("招待時にvisibilityをpublicへ上書きしようとすると失敗する", async () => {
  const [owner, inviter, invitee] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await inviter.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: inviter.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { error } = await inviter.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: inviter.userId,
    status: "considering",
    visibility: "public",
  });
  expect(error).not.toBeNull();
});

test("招待時にparticipation_stateを上書きしようとすると失敗する", async () => {
  const [owner, inviter, invitee] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await inviter.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: inviter.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { error } = await inviter.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: inviter.userId,
    status: "considering",
    participation_state: "invited",
  });
  expect(error).not.toBeNull();
});

// オーナーでも参加者でもないユーザーは招待できない
// (docs/permissions.md「最小の検証セット」)。
test("オーナーでも参加者でもないユーザーは他人を招待できない", async () => {
  const [owner, nonParticipant, invitee] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);

  const { error } = await nonParticipant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: nonParticipant.userId,
    status: "considering",
  });
  expect(error).not.toBeNull();

  // 拒否されたINSERTで行が作られていないことを、対象行を見られる本人(invitee)視点で確認する。
  const { data: inviteeRows, error: inviteeRowsError } = await invitee.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", invitee.userId);
  expect(inviteeRowsError).toBeNull();
  expect(inviteeRows).toHaveLength(0);
});

// issue #34 の決定そのもの。owner_id は「情報の管理者」であってイベントの主催・招待の
// 権限を意味しない(docs/data-model.md 2章)ため、オーナーであっても自分自身が
// 参加登録していなければ招待できない。
test("参加登録していないオーナーは他人を招待できない", async () => {
  const [owner, invitee] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  // オーナー自身は参加登録しない(この決定の検証対象そのもの)。
  const { data: ownerRows, error: ownerRowsError } = await owner.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", owner.userId);
  expect(ownerRowsError).toBeNull();
  expect(ownerRows).toHaveLength(0);

  const { error } = await owner.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: owner.userId,
    status: "considering",
  });
  expect(error).not.toBeNull();

  // 拒否されたINSERTで行が作られていないことを、対象行を見られる本人(invitee)視点で確認する。
  const { data: inviteeRows, error: inviteeRowsError } = await invitee.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", invitee.userId);
  expect(inviteeRowsError).toBeNull();
  expect(inviteeRows).toHaveLength(0);
});

// --- 削除済みイベントへの参加登録・招待 (issue #54) -------------------------------
// docs/permissions.md 権限マトリクス ※1。塞ぐのは新規INSERTのみで、既存の参加行の
// UPDATE / DELETE は削除後もできる(その確認も下にある)。

// issue #54 の攻撃手順そのもの。オーナーは非オーナー参加者がゼロなら自分のイベントを
// 論理削除できるため、「自分だけ参加登録 → 削除 → 招待」で他人のスケジュールに
// 削除済みイベントを差し込めてしまっていた。
test("削除済みイベントには他人を招待できない(参加登録済みの招待者であっても)", async () => {
  const [owner, invitee] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  // オーナー自身は参加登録する(招待の前提条件を満たす。issue #34)。
  const joinResult = await owner.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: owner.userId, status: "considering" });
  expect(joinResult.error).toBeNull();

  // 非オーナー参加者がいないので、この論理削除は成功する(guard_event_deletion)。
  await softDeleteEvent(owner, event.id);

  const { error } = await owner.client.from("event_participants").insert({
    event_id: event.id,
    user_id: invitee.userId,
    invited_by: owner.userId,
    status: "considering",
  });
  expect(error).not.toBeNull();

  // 拒否されたINSERTで行が作られていないことを、対象行を見られる本人(invitee)視点で確認する。
  // inviteeは削除済みイベント自体は見られないが、自分のevent_participants行は見られる。
  const { data: inviteeRows, error: inviteeRowsError } = await invitee.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", invitee.userId);
  expect(inviteeRowsError).toBeNull();
  expect(inviteeRows).toHaveLength(0);
});

// 招待経路だけを塞いでも足りない。オーナーは削除後も自分のイベントを閲覧できる
// (events_select_not_deleted_or_referenced)ため、自己参加登録の経路が実在する。
test("削除済みイベントには自分で参加登録できない(オーナーであっても)", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  await softDeleteEvent(owner, event.id);

  // オーナーは削除後もこのイベントを見られる。つまり「見えないから登録できない」のではなく、
  // INSERTポリシーが弾いていることを確認している。
  const { data: visible, error: visibleError } = await owner.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(visibleError).toBeNull();
  expect(visible).toHaveLength(1);

  const { error } = await owner.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: owner.userId, status: "considering" });
  expect(error).not.toBeNull();

  const { data: rows, error: rowsError } = await owner.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", owner.userId);
  expect(rowsError).toBeNull();
  expect(rows).toHaveLength(0);
});

// オーナー以外にも、削除済みイベントを見られる経路がある(そのイベントに支出を持つユーザー)。
// こちらからも参加登録できないことを確認する。
test("削除済みイベントには支出を持つユーザーも参加登録できない", async () => {
  const [owner, spender] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const expenseResult = await spender.client
    .from("expenses")
    .insert({ user_id: spender.userId, event_id: event.id, category: "ticket" });
  expect(expenseResult.error).toBeNull();
  await softDeleteEvent(owner, event.id);

  const { data: visible, error: visibleError } = await spender.client
    .from("events")
    .select()
    .eq("id", event.id);
  expect(visibleError).toBeNull();
  expect(visible).toHaveLength(1);

  const { error } = await spender.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: spender.userId, status: "considering" });
  expect(error).not.toBeNull();

  const { data: rows, error: rowsError } = await spender.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", spender.userId);
  expect(rowsError).toBeNull();
  expect(rows).toHaveLength(0);
});

// 過剰に塞いでいないことの確認。PO確認で「既存の参加行のUPDATEは現状どおり許可する」と
// 決めた(issue #54)。この2件が落ちたら、INSERT以外にも条件がかかっている。
test("削除済みイベントでも既存の参加行のステータスは変更できる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  const joinResult = await owner.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: owner.userId, status: "considering" });
  expect(joinResult.error).toBeNull();
  await softDeleteEvent(owner, event.id);

  const { error } = await owner.client
    .from("event_participants")
    .update({ status: "declined" })
    .eq("event_id", event.id)
    .eq("user_id", owner.userId);
  expect(error).toBeNull();

  const { data } = await owner.client
    .from("event_participants")
    .select("status")
    .eq("event_id", event.id)
    .eq("user_id", owner.userId)
    .single();
  expect(data?.status).toBe("declined");
});

test("削除済みイベントでも既存の参加登録は取りやめられる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  const joinResult = await owner.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: owner.userId, status: "considering" });
  expect(joinResult.error).toBeNull();
  await softDeleteEvent(owner, event.id);

  const { error } = await owner.client
    .from("event_participants")
    .delete()
    .eq("event_id", event.id)
    .eq("user_id", owner.userId);
  expect(error).toBeNull();

  const { data } = await owner.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", owner.userId);
  expect(data).toHaveLength(0);
});

test("本人は自分の参加ステータスを変更できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const setupResult = await self.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: self.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { error } = await self.client
    .from("event_participants")
    .update({ status: "applied" })
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(error).toBeNull();

  const { data } = await self.client
    .from("event_participants")
    .select("status")
    .eq("event_id", event.id)
    .eq("user_id", self.userId)
    .single();
  expect(data?.status).toBe("applied");
});

test("本人は自分の参加行のvisibilityを変更できる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const setupResult = await self.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: self.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { error } = await self.client
    .from("event_participants")
    .update({ visibility: "public" })
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(error).toBeNull();

  const { data } = await self.client
    .from("event_participants")
    .select("visibility")
    .eq("event_id", event.id)
    .eq("user_id", self.userId)
    .single();
  expect(data?.visibility).toBe("public");
});

test("他人の参加行を更新・削除できない", async () => {
  const [owner, target, actor] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await target.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: target.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { data: updated, error: updateError } = await actor.client
    .from("event_participants")
    .update({ status: "declined" })
    .eq("event_id", event.id)
    .eq("user_id", target.userId)
    .select();
  expect(updateError).toBeNull();
  expect(updated).toHaveLength(0);

  // actorはtargetの行をSELECTできないため、RETURNINGが空なだけでは
  // USING句が本当に効いているか分からない(actor視点では行があっても無くても
  // 同じ結果になる)。target自身の視点で実際に変化していないことを確認する。
  const { data: afterUpdate } = await target.client
    .from("event_participants")
    .select("status")
    .eq("event_id", event.id)
    .eq("user_id", target.userId)
    .single();
  expect(afterUpdate?.status).toBe("considering");

  const { data: deleted, error: deleteError } = await actor.client
    .from("event_participants")
    .delete()
    .eq("event_id", event.id)
    .eq("user_id", target.userId)
    .select();
  expect(deleteError).toBeNull();
  expect(deleted).toHaveLength(0);

  const { data: stillExists } = await target.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", target.userId);
  expect(stillExists).toHaveLength(1);
});

test("本人は自分の参加登録を取りやめられる", async () => {
  const [owner, self] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const setupResult = await self.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: self.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { error } = await self.client
    .from("event_participants")
    .delete()
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(error).toBeNull();

  const { data } = await self.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(data).toHaveLength(0);
});

test("非公開の参加行は他ユーザーから見えない", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await self.client
    .from("event_participants")
    .insert({ event_id: event.id, user_id: self.userId, status: "considering" });
  expect(setupResult.error).toBeNull();

  const { data, error } = await stranger.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("公開の参加行は他ユーザーからも見える", async () => {
  const [owner, self, stranger] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const event = await createEvent(owner);
  const setupResult = await self.client.from("event_participants").insert({
    event_id: event.id,
    user_id: self.userId,
    status: "considering",
    visibility: "public",
  });
  expect(setupResult.error).toBeNull();

  const { data, error } = await stranger.client
    .from("event_participants")
    .select()
    .eq("event_id", event.id)
    .eq("user_id", self.userId);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});
