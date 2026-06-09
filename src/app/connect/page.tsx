import { redirect } from "next/navigation";

/** Connect has no landing page of its own - it opens on the Inbox tab. */
export default function ConnectPage() {
  redirect("/connect/inbox");
}
