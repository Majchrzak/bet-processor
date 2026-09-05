import { createHmac } from "node:crypto";

import { z } from "zod";

const RtpRowSchema = z
  .object({
    currency: z.string(),
    rolled_back_bet: z.number().int().nonnegative(),
    rolled_back_win: z.number().int().nonnegative(),
    rounds: z.number().int().nonnegative(),
    rtp: z.number().nullable(),
    total_bet: z.number().int(),
    total_win: z.number().int(),
  })
  .strict();

const CasinoRtpSchema = z.object({ data: z.array(RtpRowSchema) }).strict();
const UserRtpRowSchema = RtpRowSchema.extend({ user_id: z.string() }).strict();
const UserRtpSchema = z
  .object({
    data: z.array(UserRtpRowSchema),
    next_cursor: z.string().nullable(),
  })
  .strict();

export type RtpRow = z.infer<typeof RtpRowSchema>;
export type UserRtpRow = z.infer<typeof UserRtpRowSchema>;

export interface ProcessAction {
  action: "bet" | "win";
  action_id: string;
  amount: number;
}

export interface ProcessRequestBody {
  actions: ProcessAction[];
  currency: string;
  finished: boolean;
  game: string;
  game_id: string;
  user_id: string;
}

interface ApiConfig {
  apiUrl: string;
  hmacSecret: string;
}

interface RtpParams {
  cursor?: string | undefined;
  from: Date;
  limit?: number;
  to: Date;
}

export function getRtp(
  config: ApiConfig,
  report: "casino",
  params: RtpParams,
): Promise<z.infer<typeof CasinoRtpSchema>>;
export function getRtp(
  config: ApiConfig,
  report: "user",
  params: RtpParams,
): Promise<z.infer<typeof UserRtpSchema>>;
export async function getRtp(
  config: ApiConfig,
  report: "user" | "casino",
  params: RtpParams,
): Promise<
  z.infer<typeof CasinoRtpSchema> | z.infer<typeof UserRtpSchema>
> {
  const path = report === "user" ? "users" : "casino";
  const url = new URL(`/reports/rtp/${path}`, config.apiUrl);

  url.searchParams.set("from", params.from.toISOString());
  url.searchParams.set("to", params.to.toISOString());

  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }

  if (params.limit) {
    url.searchParams.set("limit", String(params.limit));
  }

  const response = await fetch(url, {
    headers: { authorization: createAuthorization(config.hmacSecret, "") },
  });
  if (!response.ok) {
    throw new Error(`${report} RTP request failed with ${String(response.status)}`);
  }

  const schema = report === "user" ? UserRtpSchema : CasinoRtpSchema;
  return schema.parse(await response.json());
}

export async function sendProcessRequest(
  config: ApiConfig,
  body: ProcessRequestBody,
): Promise<Response> {
  const serializedBody = JSON.stringify(body);

  return fetch(`${config.apiUrl}/aggregator/takehome/process`, {
    body: serializedBody,
    headers: {
      authorization: createAuthorization(config.hmacSecret, serializedBody),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function createAuthorization(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `HMAC-SHA256 ${digest}`;
}
