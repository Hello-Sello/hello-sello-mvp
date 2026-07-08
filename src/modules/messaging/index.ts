/**
 * Public surface for the messaging module.
 *
 * What you get here:
 *   - ChatView       -> mount in /connect/chat to render panels 3 + 4
 *   - DealChat       -> the deal chat hero (3b); the workspace route composes it
 *   - acceptInbox    -> call from connect's acceptItem to run the rollout
 *   - AcceptInput    -> the DTO that bridges connect -> messaging
 *   - View types     -> for any consumer that needs to read conversation/message data
 *
 * New-chat picker (04B) - the FE dropdown imports ALL of these via this barrel:
 *   - getMyConnections          -> the connected companies/people directory read
 *   - openOrCreateP2pThread     -> person-mode selection (resolve-or-create P2P)
 *   - resolveC2cThread          -> company-mode selection (resolve C2C)
 *   - isNewConnection           -> the 30-day recency rule (ONE owner; FE never recomputes)
 *   - relativeDayLabel          -> the "Today / N days ago" label (ONE owner)
 *   - MyConnectionsView et al.  -> the picker view contract
 */
export { ChatView } from "./components/ChatView";
export { DealChat } from "./components/DealChat";
export {
  acceptInbox,
  openOrCreateP2pThread,
  resolveC2cThread,
  createGroupThread,
  approveGroupMember,
  renameGroupThread,
} from "./supabase/store";
export { getMyConnections, searchPeople } from "./supabase/connections";
export { isNewConnection, relativeDayLabel } from "./lib/connections-shape";
// Group creation (07-05): the picker + the window-event contract the deal card
// (07-07) dispatches to open it in deal mode.
export {
  GroupPicker,
  NEW_GROUP_EVENT,
  type NewGroupEventDetail,
  type GroupPickerMode,
} from "./components/GroupPicker";
export type {
  AcceptInput,
  ConversationListItem,
  ChatMessageView,
  ThreadType,
  AcceptRequestType,
  MyConnectionsView,
  ConnectedCompany,
  ConnectedPerson,
  PeopleSearchResult,
  GroupCreationResult,
  PendingExternalMember,
} from "./types";
