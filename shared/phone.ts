/**
 * Mobile numbers, stored in E.164 form ("+15085551234") so a text service
 * can use them as they are.
 */

/**
 * What a member typed, as stored. A bare 10-digit number is taken as U.S.
 * or Canadian (+1); anything else needs its country code with a leading +.
 * Null when it isn't a usable number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "(508) 555-1234" for a +1 number, else the stored form. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export const PHONE_HINT = "10 digits for a U.S. number, or start with + and your country code.";
