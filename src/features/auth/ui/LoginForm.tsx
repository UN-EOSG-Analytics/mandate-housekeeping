"use client";

import { SignInCard } from "@un-eosg/ui/components/sign-in-card";
import { requestMagicLinkAction } from "@/features/auth/actions";

export function LoginForm() {
  return (
    <SignInCard
      headingLevel="h1"
      onSubmit={requestMagicLinkAction}
      labels={{
        title: "Sign in",
        intro:
          "Sign in with your UN email, choose your entity, and review the citations supporting its budget submission.",
        emailLabel: "Email address",
        emailPlaceholder: "your.name@un.org",
        submit: "Send sign-in link",
        submitting: "Sending…",
        sentTitle: "Please check your email",
        sentBody: "We have sent a sign-in link to",
        errorMessage: "Could not send the sign-in link. Please try again.",
      }}
    />
  );
}
