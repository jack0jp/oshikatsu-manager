-- issue #54: 論理削除済み(events.deleted_at is not null)のイベントに対して、
-- 参加登録・招待のどちらの経路でも event_participants を新規作成できてしまう穴を塞ぐ。
--
-- 元のポリシー(20260806034559_rls_policies.sql)は events.deleted_at を一切参照していなかった。
-- オーナーは「本人以外の参加者がゼロ」なら自分のイベントを論理削除できる(guard_event_deletion)ため、
-- 削除してから招待すると、削除ガードが守ろうとした「削除できるのは非オーナー参加者がゼロのときだけ」
-- という不変条件が削除後に破れる。
--
-- 方針(issue #54 のPO確認で決定):
--   1. 参加登録・招待の**両経路**に deleted_at is null を課す。招待経路だけを塞ぐと、
--      自己参加登録の経路が残る。削除済みイベントは events_select_not_deleted_or_referenced により
--      オーナー本人と、そのイベントに expenses を持つユーザーには見えるため、この経路は実在する
--   2. 既存の参加行の UPDATE(ステータス変更・公開設定の変更)は現状どおり許可する。
--      塞ぐのは新規INSERTのみ。event_participants_update_self は変更しない
--   3. 復活(deleted_at を NULL に戻す)にガードが無い件は本PRのスコープ外(issue #58)
--
-- security definer は不要。この EXISTS は呼び出し元のRLS越しに events を読むが、
-- deleted_at is null の行は events_select_not_deleted_or_referenced により全 authenticated
-- ユーザーから見えるので、許可すべきケースを取りこぼさない。削除済みイベントは
-- (a) 見えない → EXISTS が false、(b) オーナー/支出保持者には見えるが deleted_at is not null
-- → やはり false。どちらも正しく拒否側に倒れる。
-- (guard_event_deletion が security definer を要したのは、private な参加行という
--  「呼び出し元には見えないが判定に必要な行」を読む必要があったためで、状況が異なる)

drop policy "event_participants_insert_self_or_invite" on public.event_participants;

-- 自分で登録する経路(invited_byなし) と、参加登録済みユーザーによる招待経路
-- (invited_by=自分。招待できるのは参加登録している任意のユーザー)の2通りのみ許可する。
-- 招待経路で作成する他人の行は、招待者が公開設定を勝手に指定できないよう
-- visibility='private'(既定値どおり)、participation_state='joined'
-- (docs/data-model.md 3章「MVPでの挙動」)に固定する。
-- いずれの経路も、対象イベントが未削除であることを前提とする(docs/permissions.md ※1)。
create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_participants.event_id
        and e.deleted_at is null
    )
    and (
      (user_id = auth.uid() and invited_by is null)
      or (
        invited_by = auth.uid()
        and visibility = 'private'
        and participation_state = 'joined'
        and exists (
          select 1
          from public.event_participants ep
          where ep.event_id = event_participants.event_id
            and ep.user_id = auth.uid()
        )
      )
    )
  );
