import { useMutation } from "@tanstack/react-query";

import { uploadImage } from "./api.js";

export function useImageUpload() {
  return useMutation({ mutationFn: uploadImage });
}
