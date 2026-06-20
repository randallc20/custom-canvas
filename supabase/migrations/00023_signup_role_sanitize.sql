-- SECURITY: handle_new_user trusted the client-supplied role from signup
-- metadata, so anyone could self-register as 'admin' via the anon client
-- (supabase.auth.signUp({ options: { data: { role: 'admin' } } })). The
-- role-change RLS guard doesn't help because signup SETS the role. Sanitize:
-- only self-selectable roles are allowed; anything else falls back to 'user'.
-- Admins are granted manually (service role).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested TEXT := NEW.raw_user_meta_data->>'role';
  safe_role TEXT;
BEGIN
  safe_role := CASE WHEN requested IN ('artist', 'gallery') THEN requested ELSE 'user' END;
  INSERT INTO public.profiles (id, email, role, full_name, accepted_terms_at)
  VALUES (NEW.id, NEW.email, safe_role, NEW.raw_user_meta_data->>'full_name', now());
  RETURN NEW;
END;
$$;
