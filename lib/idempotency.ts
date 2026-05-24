import { redis } from "./redis";

const TTL_SECONDS = 86400; // 24 hours

export async function getIdempotentResponse(
  key: string
): Promise<{ status: number; body: unknown } | null> {
  const cached = await redis.get<{ status: number; body: unknown }>(key);
  return cached ?? null;
}

export async function saveIdempotentResponse(
  key: string,
  status: number,
  body: unknown
): Promise<void> {
  await redis.set(
    key,
    { status, body },
    { ex: TTL_SECONDS }
  );
}