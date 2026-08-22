import { ApiError } from "../../shared/api";
import { getMe, refreshAuth } from "./api";

const canRefresh = (error) =>
  (error instanceof ApiError || error instanceof Error) &&
  error.status === 401 &&
  error.code === "UNAUTHENTICATED";

export const bootstrapAuth = async ({
  getMe: readMe = () => getMe(undefined, { authRetry: false }),
  refresh: renew = refreshAuth
} = {}) => {
  try {
    return await readMe();
  } catch (error) {
    if (!canRefresh(error)) {
      throw error;
    }
    await renew();
    return readMe();
  }
};
