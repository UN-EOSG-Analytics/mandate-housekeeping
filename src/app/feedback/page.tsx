import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/auth";

export default async function FeedbackPage() {
  // Check authentication
  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect("/login");
  }

  // Keep old feedback bookmarks working with the site's Sentry widget.
  redirect("/");
}
