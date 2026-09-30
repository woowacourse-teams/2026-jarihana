import { z } from "zod";

import { entityIdSchema } from "../common/schemas.js";

export const createFeedbackResponseSchema = z.object({
  id: entityIdSchema
}).strict();
