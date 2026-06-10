/**
 * Public surface for the messaging module.
 *
 * What you get here:
 *   - ChatView       -> mount in /connect/chat to render panels 3 + 4
 *   - DealChat       -> the deal chat hero (3b); the workspace route composes it
 *   - acceptInbox    -> call from connect's acceptItem to run the rollout
 *   - AcceptInput    -> the DTO that bridges connect -> messaging
 *   - View types     -> for any consumer that needs to read conversation/message data
 */
export { ChatView } from "./components/ChatView";
export { DealChat } from "./components/DealChat";
export { acceptInbox } from "./supabase/store";
export type {
  AcceptInput,
  ConversationListItem,
  ChatMessageView,
  ThreadType,
  AcceptRequestType,
} from "./types";
