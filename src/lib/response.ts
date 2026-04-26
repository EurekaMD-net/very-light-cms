import type { Context } from "hono";

/** Consistent success envelope: { data } */
export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ data }, status);
}

/** Consistent error envelope: { error, code } */
export function fail(
  c: Context,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 = 500,
  code?: string,
) {
  return c.json(
    { error: message, code: code ?? httpCodeLabel(status) },
    status,
  );
}

function httpCodeLabel(status: number): string {
  const labels: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE",
    500: "INTERNAL_ERROR",
  };
  return labels[status] ?? "ERROR";
}
