import { z } from "zod";

const CREW_NAME_PATTERN = /^[가-힣]{2,4}$/;
const CREW_NAME_MESSAGE = "닉네임은 한글 2~4자로 입력해 주세요.";

/**
 * 가입 화면은 닉네임만 받는다. 우아한테크코스 크루인지와 기수, 과정은 서버가 크루 명단으로 정하므로 보내지 않는다.
 */
export const memberSignupFormSchema = z.object({
  crewName: z.string().trim().regex(CREW_NAME_PATTERN, CREW_NAME_MESSAGE)
});

/** 가입 API로 보내는 요청 본문이다. */
export const memberSignupRequestSchema = z
  .object({
    crewName: z.string().regex(CREW_NAME_PATTERN, CREW_NAME_MESSAGE)
  })
  .strict();
