import { z } from 'zod';

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
  message_type: z.enum(['text', 'image', 'listing_card', 'quote_card']).default('text'),
});

export const createConversationSchema = z.object({
  participant_id: z.string().uuid(),
  context_type: z.enum(['listing', 'commission', 'general']).optional(),
  context_id: z.string().uuid().optional(),
  initial_message: z.string().min(1).max(5000),
});

export type SendMessageFormData = z.infer<typeof sendMessageSchema>;
export type CreateConversationFormData = z.infer<typeof createConversationSchema>;
