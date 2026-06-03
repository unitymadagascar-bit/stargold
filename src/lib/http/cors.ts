export const bridgeCorsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, x-mt5-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Private-Network": "true",
};

export function bridgeOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: bridgeCorsHeaders,
  });
}
