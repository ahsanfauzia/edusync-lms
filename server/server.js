
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import connectDB from "./configs/mongodb.js";
import connectCloudinary from "./configs/cloudinary.js";

import {
  clerkWebhooks,
  stripeWebhooks,
} from "./controllers/webhooks.js";

import educatorRouter from "./routes/educatorRouter.js";
import courseRouter from "./routes/courseRoute.js";
import userRouter from "./routes/userRoutes.js";
import platformRouter from "./routes/platformRoutes.js";
import adminRouter from "./routes/adminRoutes.js";

const app = express();

// Webhooks must receive the raw request body.
app.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhooks
);

app.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhooks
);

// CORS configuration
const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    "http://localhost:5173",
  ]
    .filter(Boolean)
    .map((value) => value.replace(/\/$/, ""))
);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin.replace(/\/$/, ""))
      ) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin is not allowed by CORS")
      );
    },
  })
);

app.use(express.json({ limit: "2mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  })
);

// Clerk middleware
app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    frontendApiProxy: {
      enabled: true,
      path: "/__clerk",
    },
    proxyUrl:
      process.env.CLERK_PROXY_URL ||
      `${(
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:5173"
      ).replace(/\/$/, "")}/__clerk`,
  })
);

// API rate limit guard
const requestCounts = new Map();

app.use("/api", (req, res, next) => {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${req.ip}:${minute}`;
  const count = (requestCounts.get(key) || 0) + 1;

  requestCounts.set(key, count);

  if (requestCounts.size > 10000) {
    for (const existingKey of requestCounts.keys()) {
      if (!existingKey.endsWith(`:${minute}`)) {
        requestCounts.delete(existingKey);
      }
    }
  }

  if (count > 180) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Try again shortly.",
    });
  }

  next();
});

// API routes
app.use("/api/educator", educatorRouter);
app.use("/api/course", courseRouter);
app.use("/api/user", userRouter);
app.use("/api/platform", platformRouter);
app.use("/api/admin", adminRouter);

// 404 fallback
app.use((req, res) => {
  console.log(
    `404 Route Not Found: ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Database and Cloudinary initialization
let initialized = false;
let initializationPromise;

const initializeServer = async () => {
  if (initialized) return;

  if (!initializationPromise) {
    initializationPromise = (async () => {
      await connectDB();
      await connectCloudinary();

      initialized = true;
      console.log("Server services initialized successfully");
    })().catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }

  await initializationPromise;
};

// Render and local Node.js server
const PORT = process.env.PORT || 5000;

if (process.env.RENDER || process.env.NODE_ENV !== "production") {
  initializeServer()
    .then(() => {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Server initialization failed:", error);
      process.exit(1);
    });
}

// Vercel serverless handler
const handler = async (req, res) => {
  try {
    await initializeServer();
    return app(req, res);
  } catch (error) {
    console.error("Server initialization failed:", error);

    return res.status(500).json({
      success: false,
      message: "Server initialization failed",
    });
  }
};

export default handler;
