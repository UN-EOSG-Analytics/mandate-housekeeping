# UN Mandates Housekeeping

Feedback and monitoring use Sentry; page analytics use Umami. Configure the
deployment's build environment using the variables in `.env.example`:

- `NEXT_PUBLIC_SENTRY_DSN`: this app's Sentry project DSN. Enables the feedback
  widget for signed-in users and browser/server error reporting. Feedback includes
  optional name, email, and screenshots. Performance tracing and session replay
  are disabled. No account identity is automatically attached.
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`: `491ec3b3-b18b-41d5-8b69-56dce034a580`.
  Query strings and URL hashes are excluded from analytics. Optionally set
  `NEXT_PUBLIC_UMAMI_DOMAINS` to restrict tracking to production domains.
- `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`: optional build-time
  settings for uploading source maps. Keep the auth token server-side.

Public environment variables are embedded at build time; rebuild after changing
them. Without a DSN or website ID, the corresponding integration stays disabled.
The old `/feedback` URL redirects to the dashboard, where the Sentry feedback
button is available.
