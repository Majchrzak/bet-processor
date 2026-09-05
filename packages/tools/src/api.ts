import { createHmac } from "node:crypto";

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

export async function getRtp(
  config: ApiConfig,
  report: "user" | "casino",
  params: RtpParams,
): Promise<Response> {
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

  return fetch(url, {
    headers: { authorization: createAuthorization(config.hmacSecret, "") },
  });
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
