-- Миграция 0002: аутентификация сотрудников платформы.
--
-- Пишется вручную, а не генератором: это не сущность методологии расследования,
-- а инфраструктура доступа, и смешивать их в одном источнике не нужно.
--
-- Участник интервью здесь не участвует: он не пользователь платформы и приходит
-- по подписанной ссылке через interview_access_token.

alter table app_user add column password_hash text;
alter table app_user add column password_updated_at timestamptz;
alter table app_user add column email text;
alter table app_user add column last_login_at timestamptz;

-- Адрес уникален глобально: один человек — одна учётная запись,
-- иначе привязка к организации при входе становится неоднозначной.
create unique index app_user_email_key on app_user (lower(email)) where email is not null;

create table user_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  organization_id uuid not null references organization(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_ip text,
  last_user_agent text,
  created_at timestamptz not null default now()
);

create index user_session_user_idx on user_session (user_id) where revoked_at is null;
create index user_session_expiry_idx on user_session (expires_at) where revoked_at is null;

-- Таблица сессий читается до того, как контекст арендатора известен: именно из неё
-- он и определяется. Поэтому политика опирается на пользователя, а не на организацию,
-- и доступ к ней даётся только по хэшу токена, который знает лишь владелец сессии.
alter table user_session enable row level security;
alter table user_session force row level security;
create policy user_session_access on user_session
  using (
    coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
    or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    or token_hash = nullif(current_setting('app.session_token_hash', true), '')
  )
  with check (
    coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
    or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
