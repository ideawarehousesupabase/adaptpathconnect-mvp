import { createServerFn } from "@tanstack/react-start";

// Firebase web API keys are client-identifiers, but the user stored it as a secret,
// so the browser fetches it at runtime instead of bundling it.
export const getFirebaseApiKey = createServerFn({ method: "GET" }).handler(async () => {
  return { apiKey: (process.env["GOOGLE_API_KEY"] ?? "").trim() };
});
