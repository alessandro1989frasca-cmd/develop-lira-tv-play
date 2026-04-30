import { Platform } from "react-native";

export const getBaseUrl = (): string => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }

  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!url) {
    console.warn("[API] EXPO_PUBLIC_API_BASE_URL is not set, using localhost");
    return "http://localhost:8000";
  }
  return url;
};
