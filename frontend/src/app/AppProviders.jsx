import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { NotificationSessionBoundary } from "../features/notifications/NotificationSessionBoundary";
import { AuthProvider } from "../features/auth";
import { ChatSessionProvider } from "../features/chat/ChatSessionProvider";
import { ToastProvider } from "../shared/ui";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: 0 },
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000
      }
    }
  });
}

export function AppProviders({ children }) {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider><NotificationSessionBoundary /><ChatSessionProvider>{children}</ChatSessionProvider></ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
