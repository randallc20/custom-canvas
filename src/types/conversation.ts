import { Profile } from './user';

export type ConversationContextType = 'listing' | 'commission' | 'general';

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  context_type: ConversationContextType | null;
  context_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  created_at: string;
}

export type ConversationWithParticipants = Conversation & {
  participant_one_profile: Profile;
  participant_two_profile: Profile;
};
