/**
 * Dev-only CORS origin relaxation.
 *
 * The allow-list (`CORS_ORIGINS`) stays authoritative in production. During
 * development the Flutter web preview and other local tooling run on random
 * localhost ports, and testing from a phone on the LAN needs private-range
 * origins — blocking those produces browser CORS errors that are pure friction
 * and carry no security value on a developer machine.
 *
 * Requests without an `Origin` header (native Flutter, curl, server-to-server)
 * never reach this predicate — the caller treats them as same-origin.
 */
export function isDevOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

  // `URL` normalises IPv6 to a bracketed host in some runtimes.
  if (hostname === '[::1]') return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) return false;
  const [first, second] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}
