-- Экспорт и удаление данных арендатора (§60 ТЗ).
--
-- Право быть забытым и неизменяемость журнала расследования противоречат друг другу.
-- Противоречие разрешается явно: журнал остаётся неизменяемым для приложения всегда,
-- а удаление арендатора выполняет отдельная процедура, включающая флаг внутри своей
-- транзакции. Приложению этот флаг недоступен: он не ставится ни одним маршрутом.

create or replace function forbid_mutation() returns trigger as $$
begin
  -- Единственное исключение — удаление данных арендатора (§60 ТЗ). Право быть забытым
  -- и неизменяемость журнала противоречат друг другу, и разрешать это противоречие
  -- надо явно.
  --
  -- Одного флага мало: выставить настройку сеанса может любая роль, включая роль
  -- приложения. Поэтому требуется ещё и то, чего у приложения нет и не будет, —
  -- права владельца таблицы. Удаление арендатора выполняется отдельным подключением;
  -- роль приложения не сотрёт журнал, даже если выставит флаг.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.tenant_erasure', true), 'off') = 'on'
     and current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)
  then
    return old;
  end if;

  raise exception 'Таблица % — журнальная: изменение и удаление записей запрещены', tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

-- Факт удаления арендатора переживает сами данные.
--
-- Журнал аудита удалённой организации исчезает вместе с ней — иначе удаление не было бы
-- удалением. Но «мы удалили данные такой-то организации тогда-то по такому-то основанию»
-- обязано сохраниться: без этой записи невозможно ни подтвердить исполнение требования,
-- ни объяснить, куда делись данные. Персональных данных запись не содержит.
create table tenant_deletion_record (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_slug text not null,
  organization_name text not null,
  requested_by text not null,
  reason text not null,
  deleted_rows jsonb not null,
  deleted_files integer not null default 0,
  export_sha256 text,
  deleted_at timestamptz not null default now()
);

create index tenant_deletion_record_deleted_at_idx on tenant_deletion_record (deleted_at desc);

alter table tenant_deletion_record enable row level security;
alter table tenant_deletion_record force row level security;

-- Запись видна только системному администратору: организации, которой она касается,
-- уже не существует, и относить её к какому-либо арендатору не к чему.
create policy tenant_deletion_record_system_only on tenant_deletion_record
  using (coalesce(current_setting('app.is_system_admin', true), 'off') = 'on')
  with check (coalesce(current_setting('app.is_system_admin', true), 'off') = 'on');

create trigger tenant_deletion_record_append_only before update or delete on tenant_deletion_record
  for each row execute function forbid_mutation();

-- Недостающие внешние ключи на организацию.
--
-- Часть таблиц ссылалась на организацию только колонкой, без ограничения. При работе это
-- незаметно: расследование идёт как обычно. Заметно становится ровно один раз — когда
-- клиент просит подтвердить, что его данные удалены, а в базе остаются журнальные записи
-- и учебные дела, не привязанные ни к какому делу и потому не попавшие под каскад.
do $$
declare
  target record;
begin
  for target in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'organization_id'
      -- tenant_deletion_record намеренно не ссылается на организацию: он существует
      -- ровно затем, чтобы пережить её удаление.
      and c.table_name not in ('organization', 'tenant_deletion_record')
      and not exists (
        select 1 from information_schema.table_constraints tc
        join information_schema.key_column_usage k
          on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
        where tc.table_schema = 'public'
          and tc.table_name = c.table_name
          and tc.constraint_type = 'FOREIGN KEY'
          and k.column_name = 'organization_id'
      )
  loop
    execute format(
      'alter table %I add constraint %I foreign key (organization_id) '
      || 'references organization(id) on delete cascade',
      target.table_name, target.table_name || '_organization_id_fkey'
    );
  end loop;
end $$;

-- Новый тип задачи: распознавание текста на скане.
--
-- Перечень типов задан ограничением, а не только кодом: задача с выдуманным типом
-- не должна попасть в очередь и там застрять. Ограничение обновляется отдельно,
-- потому что базы, где 0001 уже применена, переписывать нельзя.
alter table investigation_job drop constraint if exists investigation_job_job_type_check;
alter table investigation_job add constraint investigation_job_job_type_check
  check (job_type is null or job_type in (
    'transcription', 'ocr', 'document_parse', 'claim_extraction', 'timeline_rebuild',
    'contradiction_scan', 'hypothesis_review', 'report_generation'
  ));
