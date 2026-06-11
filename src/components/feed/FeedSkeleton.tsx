import { Skeleton } from '@/components/ui/Skeleton';

export function FeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid overflow-hidden rounded-lg">
          <Skeleton className={`w-full ${i % 3 === 0 ? 'h-80' : i % 3 === 1 ? 'h-64' : 'h-72'}`} />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
