const https = require("https");

const now = new Date().toISOString();
const testCallId = "test-" + Date.now();

const payload = JSON.stringify({
  events: [
    {
      eventType: "call_start",
      timestamp: now,
      idempotencyKey: testCallId + "-call_start",
      linkedId: testCallId,
      uniqueId: testCallId,
      payload: {
        uniqueId: testCallId,
        linkedId: testCallId,
        channel: "SIP/100-test",
        callerIdNum: "995555000000",
        callerIdName: "Test Caller",
        extension: "100",
        context: "from-trunk",
      },
    },
    {
      eventType: "call_end",
      timestamp: new Date(Date.now() + 5000).toISOString(),
      idempotencyKey: testCallId + "-call_end",
      linkedId: testCallId,
      uniqueId: testCallId,
      payload: {
        uniqueId: testCallId,
        linkedId: testCallId,
        channel: "SIP/100-test",
        cause: "16",
        causeTxt: "Normal Clearing",
      },
    },
  ],
});

const secret = process.env.TELEPHONY_INGEST_SECRET;
const baseUrl = process.env.CRM_BASE_URL;
if (!secret || !baseUrl) {
  console.error("Required env vars: TELEPHONY_INGEST_SECRET, CRM_BASE_URL");
  process.exit(1);
}
const url = new URL("/v1/telephony/events", baseUrl);

const options = {
  method: "POST",
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  headers: {
    "Content-Type": "application/json",
    "x-telephony-secret": secret,
    "Content-Length": Buffer.byteLength(payload),
  },
};

console.log("POST", url.href);
console.log("Payload:", payload);

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", body);
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  });
});

req.on("error", (err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
req.write(payload);
req.end();
