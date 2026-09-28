import { createFeedbackResponseSchema } from "../../entities/feedback/index.js";
import { apiRequest } from "../../shared/api/index.js";

export function createFeedback(values) {
  return apiRequest("feedbacks", {
    method: "post",
    json: values,
    schema: createFeedbackResponseSchema
  });
}
