import { redirect } from "next/navigation";

/** Connect has no landing page of its own - it opens on the Chat tab (F2). */
export default function ConnectPage() {
  redirect("/connect/chat");
}
