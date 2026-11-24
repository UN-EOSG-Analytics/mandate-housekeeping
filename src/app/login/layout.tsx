import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/auth";
import { getSignInDestination } from "@/features/auth/navigation";

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect(getSignInDestination(user));
  return <>{children}</>;
}
