/**
 * Runs a query, returning undefined ONLY when the viewer's role is denied.
 * Any other failure rethrows: a bug must surface as a bug, never disguise
 * itself as a permissions boundary the Controller would try to request.
 *
 * It lives in its own module rather than in `data.ts` because `data.ts`
 * imports `exception-view.ts`, and `exception-view.ts` needs this too. A
 * second copy of it there would be a second answer to "is this failure a
 * scope result or a defect?", and the wrong answer to that question is
 * silence.
 */
export function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    // Matched by name, not by class: the web app reaches the domain only
    // through the query service and does not depend on @icg/permissions.
    if (error instanceof Error && error.name === "AuthorizationError") return undefined;
    throw error;
  }
}
