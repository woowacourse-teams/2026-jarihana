import { z } from "zod";

import {
  bootcampStatusSchema,
  careerSchema,
  courseSchema,
  memberFieldSchema,
  memberTypeSchema
} from "../../entities/member/index.js";

const CREW_NAME_PATTERN = /^[가-힣]{2,4}$/;
const MAX_BOOTCAMP_NAME_LENGTH = 30;
const MAX_BOOTCAMP_COHORT_LENGTH = 20;
const MAX_COMPANY_NAME_LENGTH = 50;
const WOOTECO_NAMES = Object.freeze(["우아한테크코스", "우테코"]);

/** 부트캠프 목록에서 '직접 입력'을 고른 값이다. */
export const CUSTOM_BOOTCAMP = "CUSTOM";

/** 부트캠프 목록의 우아한테크코스다. 고르면 부트캠프가 아니라 크루 인증을 거쳐 크루로 가입한다. */
export const WOOTECO_BOOTCAMP = "우아한테크코스";

export function resolveBootcampName(values) {
  if (values.bootcampName === CUSTOM_BOOTCAMP) return (values.bootcampCustomName ?? "").trim();
  return values.bootcampName ?? "";
}

function isWootecoName(name) {
  return WOOTECO_NAMES.includes(name.replace(/\s/g, ""));
}

const optionalText = z.string().optional();

/**
 * 가입 화면의 입력값을 검증하고 회원 유형에 맞는 가입 요청 본문으로 바꾼다.
 * 크루와 코치 요청 본문은 기존과 같은 모양이다.
 */
export const memberSignupFormSchema = z
  .object({
    memberType: memberTypeSchema.or(z.literal("")),
    crewName: z.string().trim(),
    generation: z
      .union([z.literal(""), z.coerce.number().int().positive("기수는 1 이상의 숫자여야 해요.")])
      .optional(),
    course: courseSchema.or(z.literal("")).optional(),
    bootcampName: optionalText,
    bootcampCustomName: optionalText,
    bootcampStatus: bootcampStatusSchema.or(z.literal("")).optional(),
    bootcampCohort: optionalText,
    field: memberFieldSchema.or(z.literal("")).optional(),
    career: careerSchema.or(z.literal("")).optional(),
    companyName: optionalText,
    companyVisible: z.boolean().optional()
  })
  .superRefine((values, context) => {
    const issue = (path, message) => context.addIssue({ code: "custom", message, path: [path] });
    const { memberType } = values;

    if (memberType === "") issue("memberType", "가입 유형을 선택해 주세요.");
    if (!CREW_NAME_PATTERN.test(values.crewName)) {
      issue(
        "crewName",
        memberType === "CREW" || memberType === "" ? "크루 이름은 한글 2~4자로 입력해 주세요." : "닉네임은 한글 2~4자로 입력해 주세요."
      );
    }

    if (memberType === "CREW") {
      if (!values.course) issue("course", "과정을 선택해 주세요.");
      if (values.generation === undefined || values.generation === "") issue("generation", "기수를 선택해 주세요.");
    }

    if (memberType === "BOOTCAMP") {
      const bootcampName = resolveBootcampName(values);
      if (!values.bootcampName) issue("bootcampName", "부트캠프를 선택해 주세요.");
      else if (values.bootcampName === CUSTOM_BOOTCAMP && !bootcampName) {
        issue("bootcampCustomName", "부트캠프 이름을 입력해 주세요.");
      } else if (bootcampName.length > MAX_BOOTCAMP_NAME_LENGTH) {
        issue("bootcampCustomName", "부트캠프 이름은 30자 이하로 입력해 주세요.");
      } else if (isWootecoName(bootcampName)) {
        issue(
          values.bootcampName === CUSTOM_BOOTCAMP ? "bootcampCustomName" : "bootcampName",
          "우아한테크코스 크루는 크루 인증으로 가입해요."
        );
      }
      if ((values.bootcampCohort ?? "").trim().length > MAX_BOOTCAMP_COHORT_LENGTH) {
        issue("bootcampCohort", "기수는 20자 이하로 입력해 주세요.");
      }
      if (!values.bootcampStatus) issue("bootcampStatus", "수강 상태를 선택해 주세요.");
      if (!values.field) issue("field", "분야를 선택해 주세요.");
    }

    if (memberType === "PROFESSIONAL") {
      if (!values.field) issue("field", "직무를 선택해 주세요.");
      if (!values.career) issue("career", "연차를 선택해 주세요.");
      if ((values.companyName ?? "").trim().length > MAX_COMPANY_NAME_LENGTH) {
        issue("companyName", "회사명은 50자 이하로 입력해 주세요.");
      }
    }
  })
  .transform(toSignupRequest);

function toSignupRequest(values) {
  const { crewName, memberType } = values;
  if (memberType === "COACH") return { crewName, memberType };
  if (memberType === "BOOTCAMP") {
    const cohort = (values.bootcampCohort ?? "").trim();
    return {
      crewName,
      memberType,
      bootcamp: { name: resolveBootcampName(values), status: values.bootcampStatus, ...(cohort ? { cohort } : {}) },
      field: values.field
    };
  }
  if (memberType === "PROFESSIONAL") {
    const companyName = (values.companyName ?? "").trim();
    return {
      crewName,
      memberType,
      field: values.field,
      career: values.career,
      ...(companyName ? { company: { name: companyName, visible: Boolean(values.companyVisible) } } : {})
    };
  }
  return { crewName, memberType, course: values.course, generation: values.generation };
}

const crewNameSchema = z.string().regex(CREW_NAME_PATTERN, "크루 이름은 한글 2~4자로 입력해 주세요.");

/** 가입 API로 보내는 요청 본문이다. 화면 입력은 memberSignupFormSchema가 이 모양으로 바꾼다. */
export const memberSignupRequestSchema = z.discriminatedUnion("memberType", [
  z.object({
    memberType: z.literal("CREW"),
    crewName: crewNameSchema,
    course: courseSchema,
    generation: z.number().int().positive()
  }),
  z.object({ memberType: z.literal("COACH"), crewName: crewNameSchema }),
  z.object({
    memberType: z.literal("BOOTCAMP"),
    crewName: crewNameSchema,
    bootcamp: z.object({
      name: z.string().min(1).max(MAX_BOOTCAMP_NAME_LENGTH),
      status: bootcampStatusSchema,
      cohort: z.string().max(MAX_BOOTCAMP_COHORT_LENGTH).optional()
    }),
    field: memberFieldSchema
  }),
  z.object({
    memberType: z.literal("PROFESSIONAL"),
    crewName: crewNameSchema,
    field: memberFieldSchema,
    career: careerSchema,
    company: z.object({ name: z.string().min(1).max(MAX_COMPANY_NAME_LENGTH), visible: z.boolean() }).optional()
  })
]);
