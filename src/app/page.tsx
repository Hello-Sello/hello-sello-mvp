import { redirect } from "next/navigation";

/**
 * Root entry. For the demo we land straight in Connect (the surface the demo
 * walks). Per the locked Connect default, this will deepen to the Chats tab +
 * most-recent thread once those exist (unit 2a+).
 */
export default function RootPage() {
  redirect("/connect");
}
