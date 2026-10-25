-- =====================================================================
-- 修复：墓碑表 row_id 放宽为 text（2026-10-25）
--
-- 背景：gift_suggestion.id 是确定性文本「gift|scene|personId|festivalCode|序号」，
-- 而 sync_tombstone.row_id 建表时是 uuid。两类表共用同一对触发器函数，
-- 里面写的是 `row_id = new.id`，于是礼物建议一旦写入/删除就报
--   operator does not exist: uuid = text
-- 推送因此一直失败、待同步条数下不去，整条同步队列被卡住。
--
-- 处理：row_id 改为 text（与本地 sync_tombstone.row_id TEXT 一致），
-- 触发器里统一 ::text 后再比较 / 写入；uuid 主键转 text 是无损的。
-- =====================================================================

alter table public.sync_tombstone
  alter column row_id type text using row_id::text;

-- 物理删除时写墓碑（触发器以表所有者身份运行，绕过 RLS）
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
  values (old.user_id, v_table, old.id::text, now())
  on conflict (user_id, table_name, row_id) do nothing;
  return old;
end;
$$;

-- 复活守卫：已彻底删除的行不允许再被插入/更新回来
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
    where user_id = new.user_id and table_name = v_table and row_id = new.id::text
  ) then
    return null;
  end if;
  return new;
end;
$$;
