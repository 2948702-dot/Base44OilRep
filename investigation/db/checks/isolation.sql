-- Проверка изоляции арендатора и неизменяемости журналов.
--
-- Запускается ролью приложения (без bypassrls) против свежей схемы.
-- Любое отклонение — не косметика: это доступ к материалам чужого расследования.

\set ON_ERROR_STOP on
\set QUIET on

-- Две организации и по делу в каждой создаём под системным флагом.
do $$ begin perform set_config('app.is_system_admin', 'on', false); end $$;

insert into organization (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Организация А', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Организация Б', 'org-b');

insert into investigation_case (id, organization_id, case_number, title, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CASE-2026-0001', 'Дело А', 'draft'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'CASE-2026-0001', 'Дело Б', 'draft');

do $$ begin perform set_config('app.is_system_admin', 'off', false); end $$;

-- 1. Организация А видит только своё дело.
do $$ begin perform set_config('app.organization_id', '11111111-1111-1111-1111-111111111111', false); end $$;
do $$
declare visible int;
begin
  select count(*) into visible from investigation_case;
  if visible <> 1 then
    raise exception 'ПРОВАЛ: организация А видит % дел вместо одного', visible;
  end if;
  raise notice 'OK  изоляция чтения: видно только своё дело';
end $$;

-- 2. Прямое обращение к чужому делу по идентификатору не отдаёт строку.
do $$
declare visible int;
begin
  select count(*) into visible from investigation_case
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if visible <> 0 then
    raise exception 'ПРОВАЛ: чужое дело доступно по прямому идентификатору';
  end if;
  raise notice 'OK  чужое дело недоступно по прямому идентификатору';
end $$;

-- 3. Запись в чужую организацию отклоняется политикой.
do $$
begin
  begin
    insert into person (organization_id, case_id, name, participant_type)
      values ('22222222-2222-2222-2222-222222222222',
              'bbbbbbbb-0000-0000-0000-000000000001', 'Подлог', 'witness');
    raise exception 'ПРОВАЛ: удалось записать участника в чужую организацию';
  exception when insufficient_privilege then
    raise notice 'OK  запись в чужую организацию отклонена';
  end;
end $$;

-- 4. Соединение без выставленной организации не видит ничего.
do $$ begin perform set_config('app.organization_id', '', false); end $$;
do $$
declare visible int;
begin
  select count(*) into visible from investigation_case;
  if visible <> 0 then
    raise exception 'ПРОВАЛ: соединение без организации видит % дел', visible;
  end if;
  raise notice 'OK  соединение без организации не видит данных';
end $$;

-- 5. Журнал аудита не изменяется и не удаляется.
do $$ begin perform set_config('app.organization_id', '11111111-1111-1111-1111-111111111111', false); end $$;
insert into audit_event (organization_id, case_id, actor, actor_type, object_type, object_id, operation)
  values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
          'user_1', 'user', 'InvestigationCase', 'aaaaaaaa-0000-0000-0000-000000000001', 'create');

do $$
begin
  begin
    update audit_event set reason = 'подчистка';
    raise exception 'ПРОВАЛ: запись журнала аудита изменена';
  exception when restrict_violation then
    raise notice 'OK  изменение журнала аудита запрещено базой';
  end;
end $$;

do $$
begin
  begin
    delete from audit_event;
    raise exception 'ПРОВАЛ: запись журнала аудита удалена';
  exception when restrict_violation then
    raise notice 'OK  удаление журнала аудита запрещено базой';
  end;
end $$;

-- 6. Код утверждения уникален внутри дела.
insert into source (organization_id, case_id, type) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'document');
do $$
declare src uuid;
begin
  select id into src from source limit 1;
  insert into claim (organization_id, case_id, claim_code, text, source_id)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'C-001', 'первое', src);
  begin
    insert into claim (organization_id, case_id, claim_code, text, source_id)
      values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'C-001', 'дубль', src);
    raise exception 'ПРОВАЛ: код утверждения повторился внутри дела';
  exception when unique_violation then
    raise notice 'OK  код утверждения уникален внутри дела';
  end;
end $$;

-- 7. Утверждение не может ссылаться на несуществующий источник.
do $$
begin
  begin
    insert into claim (organization_id, case_id, claim_code, text, source_id)
      values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
              'C-999', 'висячая ссылка', '00000000-0000-0000-0000-000000000999');
    raise exception 'ПРОВАЛ: утверждение сослалось на несуществующий источник';
  exception when foreign_key_violation then
    raise notice 'OK  висячая ссылка на источник отклонена';
  end;
end $$;


-- 9. Роль приложения не стирает журнал даже с выставленным флагом стирания.
--
-- Флаг `app.tenant_erasure` может выставить любая роль: настройка сеанса не защищена
-- ничем. Защищает второе условие — права владельца таблиц, которых у приложения нет.
-- Без этой проверки удаление арендатора выглядело бы как дыра в неизменяемости журнала.
do $$
declare
  ok boolean := false;
begin
  perform set_config('app.is_system_admin', 'on', true);
  perform set_config('app.tenant_erasure', 'on', true);
  begin
    delete from audit_event;
  exception when others then
    ok := true;
  end;
  perform set_config('app.tenant_erasure', 'off', true);
  perform set_config('app.is_system_admin', 'off', true);

  if ok then
    raise notice 'OK  журнал не стирается ролью приложения даже с флагом стирания';
  else
    raise exception 'ПРОВАЛ: роль приложения стёрла журнал аудита';
  end if;
end $$;

\echo 'Все проверки изоляции и целостности пройдены'
