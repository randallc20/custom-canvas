interface PresenceIndicatorProps {
  isOnline: boolean;
}

export function PresenceIndicator({ isOnline }: PresenceIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
      <span className="text-xs text-muted">{isOnline ? 'Online' : 'Offline'}</span>
    </span>
  );
}
