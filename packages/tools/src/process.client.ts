import { createHmac } from "node:crypto";

const REQUEST_TIMEOUT_MS = 10_000;

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

export async function sendProcessRequest(
  config: { apiUrl: string; hmacSecret: string },
  body: ProcessRequestBody,
): Promise<Response> {
  const serializedBody = JSON.stringify(body);
  const digest = createHmac("sha256", config.hmacSecret)
    .update(serializedBody)
    .digest("hex");

  return fetch(`${config.apiUrl}/aggregator/takehome/process`, {
    body: serializedBody,
    headers: {
      authorization: `HMAC-SHA256 ${digest}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}
