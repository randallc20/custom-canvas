import { Commission } from '@/types/commission';
import { Badge } from '@/components/ui/Badge';
import { commissionDisplayStatus } from '@/utils/commissionDisplay';

const STEPS = ['pending', 'quoted', 'accepted', 'in_progress', 'completed', 'delivered', 'confirmed'];

interface CommissionStatusProps {
  commission: Commission;
  viewerIsRequester?: boolean;
}

export function CommissionStatus({ commission, viewerIsRequester }: CommissionStatusProps) {
  const currentStep = STEPS.indexOf(commission.status);
  // Same display mapping as the panel header — this used to show the raw DB
  // status ('cancelled', red) beside the header's 'Declined by artist'.
  const display = commissionDisplayStatus(commission.status, {
    closedBy: commission.closed_by,
    viewerIsRequester,
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-ink">Status:</span>
        <Badge variant={display.variant}>
          {display.label}
          {display.sub ? ` — ${display.sub}` : ''}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className={`h-3 w-3 rounded-full ${i <= currentStep ? 'bg-terra' : 'bg-sand'}`} />
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 ${i < currentStep ? 'bg-terra' : 'bg-sand'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
