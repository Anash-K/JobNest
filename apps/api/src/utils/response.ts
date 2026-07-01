/** Standard success envelope for all API responses. */
export function ok<T>(data: T) {
  return { success: true as const, data };
}
