import {
  myRegistrationPageSchema,
  registrationCreateResponseSchema,
  registrationDecisionResponseSchema,
  registrationPageSchema,
  registrationSummarySchema
} from "../../entities/registration/index.js";
import { apiRequest } from "../../shared/api/index.js";

export function buildRegistrationSearchParams(filters = {}, mine = false) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      return typeof value !== "string" || value.trim().length > 0;
    })
  );
  return mine ? { ...params, applicant: "me" } : params;
}

export function fetchRegistrations(recruitmentId, filters = {}) {
  return apiRequest(`recruitments/${recruitmentId}/registrations`, {
    searchParams: buildRegistrationSearchParams(filters),
    schema: registrationPageSchema
  });
}

export function fetchMyRegistrations(filters = {}) {
  return apiRequest("registrations", {
    searchParams: buildRegistrationSearchParams(filters, true),
    schema: myRegistrationPageSchema
  });
}

export function fetchRegistrationSummary(groupId) {
  return apiRequest(`groups/${groupId}/registrations/summary`, {
    schema: registrationSummarySchema
  });
}

export function markRegistrationsRead(recruitmentId, throughRegistrationId) {
  return apiRequest(`recruitments/${recruitmentId}/registrations/read`, {
    method: "patch",
    json: { throughRegistrationId }
  });
}

export function createRegistration(recruitmentId, values) {
  return apiRequest(`recruitments/${recruitmentId}/registrations`, {
    method: "post",
    json: values,
    schema: registrationCreateResponseSchema
  });
}

export function withdrawRegistration(recruitmentId, registrationId) {
  return apiRequest(`recruitments/${recruitmentId}/registrations/${registrationId}`, {
    method: "delete"
  });
}

export function decideRegistration(recruitmentId, registrationId, decision) {
  return apiRequest(`recruitments/${recruitmentId}/registrations/${registrationId}`, {
    method: "patch",
    json: decision,
    schema: registrationDecisionResponseSchema
  });
}
