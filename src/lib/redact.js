// The Console API key must never reach any output. Every line the CLI writes, to the
// terminal or to a file, passes through a redactor built from the key in use.

export const REDACTED = "[redacted]";

// Statsig key prefixes. Console keys start with "console-", server keys with
// "secret-" and client keys with "client-".
const KEY_PATTERN = /\b(console|secret|client)-[A-Za-z0-9_-]{6,}/g;

/**
 * Returns a function that removes `secrets` (exact strings) from text.
 * With `{ patterns: true }` it also masks anything shaped like a Statsig key, which
 * is used for error messages and logs, where a server response might echo a key.
 */
export function createRedactor(secrets = []) {
  const exact = secrets.filter((s) => typeof s === "string" && s.length >= 8);
  const redact = (text, { patterns = false } = {}) => {
    let out = String(text ?? "");
    for (const secret of exact) out = out.split(secret).join(REDACTED);
    if (patterns) out = out.replace(KEY_PATTERN, `$1-${REDACTED}`);
    return out;
  };
  return redact;
}

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * "dana.reyes@acme.example" becomes "d" + an ellipsis + "@acme.example".
 * The domain stays, so a typo in it is still visible.
 */
export function maskEmails(text) {
  return String(text ?? "").replace(EMAIL, "$1\u2026@$2");
}
