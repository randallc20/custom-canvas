import { useMutation } from '@tanstack/react-query';
import { createReport } from '@/services/reports';
import { useToast } from '@/components/ui/Toast';
import { toastError } from '@/hooks/toastError';

export function useCreateReport() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: createReport,
    // CONVENTIONS rule 2: the report modal's only feedback was the spinner
    // ending, so an RLS refusal read as "submitted".
    onError: toastError(toast, 'useCreateReport'),
  });
}
