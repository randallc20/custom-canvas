import { Commission } from '@/types/commission';
import { Badge } from '@/components/ui/Badge';

const STEPS = ['pending', 'quoted', 'accepted', 'in_progress', 'completed', 'delivered', 'confirmed'];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  quoted: 'info',
  accepted: 'info',
  in_progress: 'info',
  completed: 'success',
  delivered: 'success',
  confirmed: 'success',
  disputed: 'danger',
  cancelled: 'danger',
};

interface CommissionStatusProps {
  commission: Commission;
}

export function CommissionStatus({ commission }: CommissionStatusProps) {
  const currentStep = STEPS.indexOf(commission.status);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Status:</span>
        <Badge variant={statusVariant[commission.status] ?? 'default'}>
          {commission.status.replace('_', ' ')}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className={`h-3 w-3 rounded-full ${i <= currentStep ? 'bg-[#E8704A]' : 'bg-gray-200'}`} />
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 ${i < currentStep ? 'bg-[#E8704A]' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
