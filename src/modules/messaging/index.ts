/**
 * Public surface for the messaging module.
 *
 * What you get here:
 *   - ChatView       -> mount in /connect/chat to render panels 3 + 4
 *   - acceptInbox    -> call from connect's acceptItem to run the rollout
 *   - AcceptInput    -> the DTO that bridges connect -> messaging
 *   - View types     -> for any consumer that needs to read conversation/message data
 */
export { ChatView } from "./components/ChatView";
export { acceptInbox } from "./mock/store";
export type {
  AcceptInput,
  ConversationListItem,
  ChatMessageView,
  ThreadType,
  AcceptRequestType,
} from "./types";
