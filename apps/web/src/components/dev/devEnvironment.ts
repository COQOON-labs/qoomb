/**
 * Central source of truth for dev-environment URLs and context.
 *
 * Prisma Studio always runs on localhost:5555 (local machine only).
 * localhost is a "potentially trustworthy origin" per the W3C Secure Contexts spec,
 * so Chrome permits fetch() to http://localhost even from an HTTPS page.
 */
export function getDevEnvironment() {
  const origin = window.location.origin;

  const trpcUrl = import.meta.env.VITE_API_URL
    ? `${String(import.meta.env.VITE_API_URL)}/trpc`
    : `${origin}/trpc`;

  return {
    origin,
    trpcUrl,
    prismaStudioUrl: 'http://localhost:5555' as const,
  };
}
