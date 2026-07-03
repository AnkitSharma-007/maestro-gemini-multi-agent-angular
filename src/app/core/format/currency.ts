/**
 * Normalize a model-supplied currency string for `CurrencyPipe`.
 *
 * The LLM is asked for an ISO 4217 code but can return junk ("Rs", "rupees",
 * "₹", "", null). `CurrencyPipe` with a non-standard code renders oddly (or, for
 * some inputs, throws), so we only pass through well-formed 3-letter codes and
 * fall back to a safe default otherwise.
 */
export function safeCurrencyCode(
  code: string | null | undefined,
  fallback = 'USD',
): string {
  const normalized = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}
