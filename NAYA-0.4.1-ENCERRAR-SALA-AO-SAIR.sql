-- RetroPlay / Naya Engine 0.4.1
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
-- Regra nova: se HOST ou CONVIDADO clicar em sair, a sala inteira é excluída.

create or replace function public.arena_leave_room(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_user is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  -- Somente alguém que realmente participa da sala pode encerrá-la.
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
    -- Se ela já foi excluída pelo outro jogador, consideramos sucesso.
    if not exists (select 1 from public.arena_rooms r where r.code = v_code) then
      return true;
    end if;
    raise exception 'NOT_IN_ROOM';
  end if;

  -- Exclui os participantes primeiro para funcionar mesmo sem ON DELETE CASCADE.
  delete from public.arena_players
  where room_code = v_code;

  delete from public.arena_rooms
  where code = v_code;

  return true;
end;
$$;

revoke all on function public.arena_leave_room(text) from public;
grant execute on function public.arena_leave_room(text) to authenticated;

notify pgrst, 'reload schema';
