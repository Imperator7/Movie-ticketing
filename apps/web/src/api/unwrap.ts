/**
 * orval's fetch client types every response as `{ data, status }` per status code. The api-client throws
 * `ApiError` for non-2xx, so a resolved response is a success: this helper picks its data.
 */
type SuccessData<T> = T extends { status: 200 | 201; data: infer D } ? D : never;

export function dataOf<T extends { status: number; data: unknown }>(
  response: T | undefined,
): SuccessData<T> | undefined {
  if (!response || response.status < 200 || response.status >= 300) return undefined;
  return response.data as SuccessData<T>;
}
