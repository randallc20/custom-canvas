interface CompletenessBarProps {
  score: number;
}

export function CompletenessBar({ score }: CompletenessBarProps) {
  const clampedScore = Math.min(100, Math.max(0, score));

  const color =
    clampedScore >= 80
      ? 'bg-green-500'
      : clampedScore >= 50
        ? 'bg-yellow-500'
        : 'bg-orange-500';

  const label =
    clampedScore >= 80
      ? 'Looking great!'
      : clampedScore >= 50
        ? 'Almost there — keep going.'
        : 'A few more details will help buyers find you.';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">Profile Completeness</span>
        <span className="font-semibold text-ink">{clampedScore}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sand">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
