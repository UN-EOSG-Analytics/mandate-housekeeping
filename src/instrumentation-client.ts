import * as Sentry from "@sentry/nextjs";

// Keep local compilation/HMR failures out of the shared Sentry project.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_SENTRY_DSN
) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    integrations: [
      Sentry.feedbackIntegration({
        // The authenticated feedback component mounts the button.
        autoInject: false,
        colorScheme: "light",
        showBranding: false,
        enableScreenshot: true,
        themeLight: {
          // The widget's shadow DOM cannot inherit the app's theme variables.
          accentBackground: "#009edb",
          accentForeground: "#ffffff",
          boxShadow: "none",
          borderRadius: "0.5rem",
        },
        triggerLabel: "Give Feedback",
        triggerAriaLabel: "Open feedback form",
        formTitle: "Share feedback",
        submitButtonLabel: "Send",
        messagePlaceholder:
          "What's not working, confusing, or could be better?",
        nameLabel: "Name (optional)",
        emailLabel: "Email (optional)",
      }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
