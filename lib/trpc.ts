import { createTRPCClient, httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import { Platform } from "react-native";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = (): string => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }

  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!url) {
    console.warn("[tRPC] EXPO_PUBLIC_API_BASE_URL is not set, using localhost");
    return "http://localhost:8000";
  }
  return url;
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: () => `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});

export const vanillaClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: () => `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
