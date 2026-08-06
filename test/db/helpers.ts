import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types";

// service_roleキーはここでも一切使わない(docs/permissions.md「RLS検証の必須要件」)。
// 各テストユーザーはauth.signUpで作成した実際のセッションを使う。

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error(
    "API_URL / ANON_KEY が未設定です。CIでは `supabase status -o env` の出力を渡しています。" +
      "ローカルで実行する場合は `supabase start` 後に同コマンドの出力を環境変数として渡してください。",
  );
}

export const createAnonClient = (): SupabaseClient<Database> =>
  createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type TestUser = {
  client: SupabaseClient<Database>;
  userId: string;
};

export const createTestUser = async (): Promise<TestUser> => {
  const client = createAnonClient();
  const email = `test-${crypto.randomUUID()}@example.com`;
  const { data, error } = await client.auth.signUp({
    email,
    password: crypto.randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`テストユーザー作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return { client, userId: data.user.id };
};

export type CreateEventOverrides = Partial<
  Database["public"]["Tables"]["events"]["Insert"]
>;

export const createEvent = async (
  owner: TestUser,
  overrides: CreateEventOverrides = {},
) => {
  const { data, error } = await owner.client
    .from("events")
    .insert({
      owner_id: owner.userId,
      genre: "idol",
      title: "test event",
      starts_at: new Date().toISOString(),
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`イベント作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
};
