-- RetroPlay / Naya Engine 0.4.9
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
-- Ao clicar em "SAIR E ENCERRAR", HOST ou CONVIDADO apaga a sala inteira.
-- Não altera criação, entrada, conexão, transmissão ou inicialização dos jogos.

create or replace function public.arena_leave_room(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_room_exists boolean;
begin
  if v_user is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if v_code = '' then
    raise exception 'ROOM_CODE_REQUIRED';
  end if;

  select exists (
    select 1 from public.arena_rooms r where r.code = v_code
  ) into v_room_exists;

  -- Se o outro aparelho já apagou a sala, a operação continua sendo sucesso.
  if not v_room_exists then
    return true;
  end if;

  -- Segurança: somente o dono ou um participante pode encerrar a sala.
  if not exists (
    select 1
    from public.arena_rooms r
    where r.code = v_code
      and r.host_user_id = v_user
  ) and not exists (
    select 1
    from public.arena_players p
    where p.room_code = v_code
      and p.user_id = v_user
  ) then
    raise exception 'NOT_IN_ROOM';
  end if;

  -- Apaga primeiro os jogadores para não depender de ON DELETE CASCADE.
  delete from public.arena_players
  where room_code = v_code;

  -- Apaga definitivamente a sala e libera o código.
  delete from public.arena_rooms
  where code = v_code;

  -- Confirma que não sobrou registro preso.
  if exists (select 1 from public.arena_rooms r where r.code = v_code) then
    raise exception 'ROOM_DELETE_FAILED';
  end if;

  return true;
end;
$$;

revoke all on function public.arena_leave_room(text) from public;
grant execute on function public.arena_leave_room(text) to authenticated;

notify pgrst, 'reload schema';
