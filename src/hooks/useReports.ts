import { useMutation } from '@tanstack/react-query';
import { createReport } from '@/services/reports';

export function useCreateReport() {
  return useMutation({
    mutationFn: createReport,
  });
}
