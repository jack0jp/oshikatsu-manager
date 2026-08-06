import { expect, test } from "vitest";
import { createTestUser } from "./helpers";

test("本人はbudgetsを作成・閲覧できる", async () => {
  const user = await createTestUser();
  const { data, error } = await user.client
    .from("budgets")
    .insert({
      user_id: user.userId,
      period_type: "monthly",
      period_start: "2026-08-01",
      amount: 10000,
    })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data?.user_id).toBe(user.userId);
});

test("他人になりすましてbudgetsを作成できない", async () => {
  const [actor, victim] = await Promise.all([createTestUser(), createTestUser()]);
  const { error } = await actor.client.from("budgets").insert({
    user_id: victim.userId,
    period_type: "monthly",
    period_start: "2026-08-01",
    amount: 10000,
  });
  expect(error).not.toBeNull();
});

test("他人のbudgetsは見えない", async () => {
  const [self, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const { data: created, error: createError } = await self.client
    .from("budgets")
    .insert({
      user_id: self.userId,
      period_type: "monthly",
      period_start: "2026-08-01",
      amount: 10000,
    })
    .select()
    .single();
  expect(createError).toBeNull();

  const { data, error } = await stranger.client
    .from("budgets")
    .select()
    .eq("id", created?.id ?? "");
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("他人のbudgetsは更新・削除できない", async () => {
  const [self, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const { data: created, error: createError } = await self.client
    .from("budgets")
    .insert({
      user_id: self.userId,
      period_type: "monthly",
      period_start: "2026-08-01",
      amount: 10000,
    })
    .select()
    .single();
  expect(createError).toBeNull();
  const id = created?.id ?? "";

  const { data: updated } = await stranger.client
    .from("budgets")
    .update({ amount: 1 })
    .eq("id", id)
    .select();
  expect(updated).toHaveLength(0);

  // strangerは他人のbudgetsをSELECTできないため、RETURNINGが空なだけでは
  // USING句が効いているか分からない。本人視点で実際に変化していないことを確認する。
  const { data: afterUpdate } = await self.client
    .from("budgets")
    .select("amount")
    .eq("id", id)
    .single();
  expect(afterUpdate?.amount).toBe(10000);

  const { data: deleted } = await stranger.client.from("budgets").delete().eq("id", id).select();
  expect(deleted).toHaveLength(0);

  const { data: stillExists } = await self.client.from("budgets").select().eq("id", id);
  expect(stillExists).toHaveLength(1);
});

test("本人は自分のbudgetsを削除できる", async () => {
  const user = await createTestUser();
  const { data: created, error: createError } = await user.client
    .from("budgets")
    .insert({
      user_id: user.userId,
      period_type: "monthly",
      period_start: "2026-08-01",
      amount: 10000,
    })
    .select()
    .single();
  expect(createError).toBeNull();
  const id = created?.id ?? "";

  const { error } = await user.client.from("budgets").delete().eq("id", id);
  expect(error).toBeNull();

  const { data: gone } = await user.client.from("budgets").select().eq("id", id);
  expect(gone).toHaveLength(0);
});

test("同一期間の全ジャンル合算枠(genre NULL)は重複作成できない", async () => {
  const user = await createTestUser();
  const first = await user.client.from("budgets").insert({
    user_id: user.userId,
    period_type: "monthly",
    period_start: "2026-09-01",
    amount: 10000,
  });
  expect(first.error).toBeNull();

  const second = await user.client.from("budgets").insert({
    user_id: user.userId,
    period_type: "monthly",
    period_start: "2026-09-01",
    amount: 10000,
  });
  expect(second.error).not.toBeNull();
});
