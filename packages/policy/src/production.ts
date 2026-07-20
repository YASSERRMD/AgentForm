const PRODUCTION_ENVIRONMENT_PATTERN = /^prod(uction)?$/i;

/** True when a `spec.runtime.environment` value reads as "production" (matches "prod"/"production", case-insensitively). Shared by every policy that only applies to production deploys (AF008, AF013). */
export function isProductionEnvironment(environment: string): boolean {
  return PRODUCTION_ENVIRONMENT_PATTERN.test(environment);
}
