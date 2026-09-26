import { useMutation } from "@tanstack/react-query";

import { captureEvent } from "../../shared/analytics/index.js";
import { createFeedback } from "./api.js";

export function useCreateFeedback() {
  return useMutation({
    mutationFn: createFeedback,
    onSuccess: () => captureEvent("feedback_submitted")
  });
}
