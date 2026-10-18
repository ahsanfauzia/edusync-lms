import handler from "../server.js";

const getFrontendUrl = () => (process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

const getClerkFapiUrl = () => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("CLERK_PUBLISHABLE_KEY is missing");
  }

  const encoded = publishableKey.split("_")[2];

  if (!encoded) {
    throw new Error("Invalid CLERK_PUBLISHABLE_KEY");
  }

  return Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
};

const getRequestBody = async (req) => {
  if (["GET", "HEAD"].includes(req.method)) {
    return undefined;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

const clerkProxy = async (req, res) => {
  const fapiUrl = getClerkFapiUrl();

  const proxyPath = req.url.replace(/^\/__clerk/, "");

  const targetUrl = `https://${fapiUrl}${proxyPath}`;

  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;

    const lowerKey = key.toLowerCase();

    if (
      lowerKey === "host" ||
      lowerKey === "content-length" ||
      lowerKey === "connection"
    ) {
      continue;
    }

    headers.set(
      key,
      Array.isArray(value) ? value.join(", ") : value
    );
  }

  headers.set(
    "Clerk-Proxy-Url",
    `${getFrontendUrl()}/__clerk`
  );

  headers.set(
    "Clerk-Secret-Key",
    process.env.CLERK_SECRET_KEY
  );

  const forwardedFor =
    req.headers["x-real-ip"] ||
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-forwarded-for"] ||
    "";

  if (forwardedFor) {
    headers.set(
      "X-Forwarded-For",
      Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(",")[0].trim()
    );
  }

  const body = await getRequestBody(req);

  const clerkResponse = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  res.statusCode = clerkResponse.status;

  clerkResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") return;

    res.setHeader(key, value);
  });

  const location = clerkResponse.headers.get("location");

  if (location) {
    res.setHeader(
      "location",
      location.replace(
        `https://${fapiUrl}`,
        `${getFrontendUrl()}/__clerk`
      )
    );
  }

  const responseBuffer = Buffer.from(
    await clerkResponse.arrayBuffer()
  );

  res.end(responseBuffer);
};

export default async function apiHandler(req, res) {
  try {
    if (req.url.startsWith("/__clerk/")) {
      return await clerkProxy(req, res);
    }

    return handler(req, res);
  } catch (error) {
    console.error("Clerk proxy error:", error);

    return res.status(500).json({
      success: false,
      message: "Clerk proxy failed",
    });
  }
}