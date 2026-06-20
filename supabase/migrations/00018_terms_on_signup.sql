-- Registration requires accepting the Terms (UI-gated), so stamp the consent
-- timestamp at profile creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name, accepted_terms_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name',
    now()
  );
  RETURN NEW;
END;
$$;
