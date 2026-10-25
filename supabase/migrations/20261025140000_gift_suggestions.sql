-- =====================================================================
-- 礼物建议持久化（2026-10-25）
--
-- 目标：每个「场景 + 收件人 + 节日」保存最近一批 AI 礼物建议，随账号同步；
-- 退出重进、换机重装登录后都能看到同样的 4 条，不必重新生成。
--
-- 设计：
--   * id 用确定性文本「gift|scene|personId|festivalCode|序号」，客户端重新生成时
--     原地覆盖同样的几行，不会每次产生新 id 和墓碑，两端并发只按槽位 LWW。
--   * person 删除时级联删除（礼物建议没有长期保留价值），触发器自动写墓碑。
--   * 与 prepare_record 一样用复合外键 (user_id, person_id) 防止引用别人的对象。
-- =====================================================================

create table if not exists public.gift_suggestion (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid,
  scene text not null check (scene in ('contact', 'holiday')),
  festival_code text,
  name text not null,
  reason text not null default '',
  keyword text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  foreign key (user_id, person_id) references public.person (user_id, id) on delete cascade
);

create index if not exists idx_gift_user on public.gift_suggestion (user_id);
create index if not exists idx_gift_lookup
  on public.gift_suggestion (user_id, scene, person_id, festival_code, sort_order);

-- ---------------------------------------------------------------------
-- 墓碑表支持 gift：约束里补上表名
-- ---------------------------------------------------------------------
alter table public.sync_tombstone drop constraint if exists sync_tombstone_table_name_check;
alter table public.sync_tombstone add constraint sync_tombstone_table_name_check
  check (table_name in ('person', 'anniversary', 'trait', 'history', 'prepare', 'gift'));

-- 触发器函数：把云端表名映射成客户端表名（新增 gift_suggestion → gift）
create or replace function public.sync_write_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  v_table := case tg_table_name
    when 'prepare_record' then 'prepare'
    when 'gift_suggestion' then 'gift'
    else tg_table_name
  end;
  insert into public.sync_tombstone (user_id, table_name, row_id, deleted_at)
  values (old.user_id, v_table, old.id, now())
  on conflict (user_id, table_name, row_id) do nothing;
  return old;
end;
$$;

create or replace function public.sync_block_resurrection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  v_table := case tg_table_name
    when 'prepare_record' then 'prepare'
    when 'gift_suggestion' then 'gift'
    else tg_table_name
  end;
  if exists (
    select 1 from public.sync_tombstone
    where user_id = new.user_id and table_name = v_table and row_id = new.id
  ) then
    return null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 触发器（与既有业务表一致：meta 戳 / 复活守卫 / 删除写墓碑）
-- ---------------------------------------------------------------------
drop trigger if exists trg_gift_suggestion_touch_meta on public.gift_suggestion;
create trigger trg_gift_suggestion_touch_meta before insert or update on public.gift_suggestion
  for each row execute function public.sync_touch_meta();

drop trigger if exists trg_gift_suggestion_resurrection on public.gift_suggestion;
create trigger trg_gift_suggestion_resurrection before insert or update on public.gift_suggestion
  for each row execute function public.sync_block_resurrection();

drop trigger if exists trg_gift_suggestion_tombstone on public.gift_suggestion;
create trigger trg_gift_suggestion_tombstone after delete on public.gift_suggestion
  for each row execute function public.sync_write_tombstone();

-- ---------------------------------------------------------------------
-- RLS 与权限
-- ---------------------------------------------------------------------
alter table public.gift_suggestion enable row level security;
drop policy if exists gift_suggestion_owner on public.gift_suggestion;
create policy gift_suggestion_owner on public.gift_suggestion for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.gift_suggestion to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gift_suggestion'
    ) then
      alter publication supabase_realtime add table public.gift_suggestion;
    end if;
  end if;
end $$;
