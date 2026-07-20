export type FeatureSupportLevel = 'supported' | 'partial' | 'unsupported' | 'emulated';

/** One IR feature (a resource, a resource's field, a workflow node type, ...) and how well the target framework can represent it. */
export interface FeatureSupportEntry {
  readonly feature: string;
  readonly level: FeatureSupportLevel;
  readonly detail?: string;
  readonly resourceAddress?: string;
}

/**
 * What `validateCompatibility` returns — every field §12 requires an
 * adapter to report (supported/partial/unsupported/emulated features via
 * `entries`, generated dependencies, framework version, runtime
 * requirements, security warnings). `hasBlockingIncompatibility` is `true`
 * when at least one `entries` item is `unsupported` for a feature the IR
 * actually uses — the compiler must fail rather than silently ignore it
 * (§12 "Do not silently ignore unsupported specification fields").
 */
export interface CompatibilityReport {
  readonly target: string;
  readonly entries: readonly FeatureSupportEntry[];
  readonly generatedDependencies: Readonly<Record<string, string>>;
  readonly frameworkVersion: string;
  readonly runtimeRequirements: readonly string[];
  readonly securityWarnings: readonly string[];
  readonly hasBlockingIncompatibility: boolean;
}
