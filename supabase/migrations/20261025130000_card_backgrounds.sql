-- =====================================================================
-- 贺卡背景图上云（2026-10-25）
--
-- 目标：卸载重装/换机登录后，贺卡背景图直接回来，不必重新生成（省一次 AI 额度）。
--
-- 设计：
--   * Storage 私有桶 card-backgrounds，路径固定为 <user_id>/<prepare_id>.jpg。
--     路径首段即 uid，policy 据此判断归属，杜绝跨账号读写。
--   * prepare_record 增加 background_path（Storage 相对路径，纳入同步）；
--     带签名的临时 URL 仍是本机缓存，不上云。
--   * 同一张贺卡「换一张背景」覆盖同一路径（upsert），不会越积越多。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 背景图路径列
-- ---------------------------------------------------------------------
alter table public.prepare_record
  add column if not exists background_path text;

-- ---------------------------------------------------------------------
-- 2. 私有桶（单张 3:4 2K JPEG 约 0.3~1MB，限 8MB 足够）
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-backgrounds', 'card-backgrounds', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. RLS：每个用户只能读写自己 uid 目录下的对象
-- ---------------------------------------------------------------------
drop policy if exists card_backgrounds_owner_select on storage.objects;
create policy card_backgrounds_owner_select on storage.objects for select to authenticated
  using (
    bucket_id = 'card-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists card_backgrounds_owner_insert on storage.objects;
create policy card_backgrounds_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists card_backgrounds_owner_update on storage.objects;
create policy card_backgrounds_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'card-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'card-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists card_backgrounds_owner_delete on storage.objects;
create policy card_backgrounds_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
