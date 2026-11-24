export const MY_SUBMISSION_PATH = "/my-submission";

/** Only sign-in uses this default; direct routes and Overview remain available. */
export function getSignInDestination(user: { isReviewer: boolean }): string {
  return user.isReviewer ? "/" : MY_SUBMISSION_PATH;
}
