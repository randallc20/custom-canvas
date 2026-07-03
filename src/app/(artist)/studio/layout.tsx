import { StudioNav } from '@/components/studio/StudioNav';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <StudioNav />
      {children}
    </div>
  );
}
