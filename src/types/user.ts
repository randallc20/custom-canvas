export type Role = 'artist' | 'user' | 'gallery' | 'admin';

export interface Profile {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
