import { Suspense } from "react";
import { ChatView } from "@/modules/messaging";

/**
 * Chat route - mounts the Connect chat (conversation list + thread). Suspense
 * is required here because ChatView reads useSearchParams() (Task 8b: the
 * `?relationship=&deal=` deep-link contract) - Next.js bails a page that uses
 * it into full client-side rendering unless a Suspense boundary wraps it.
 */
export default function ConnectChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
