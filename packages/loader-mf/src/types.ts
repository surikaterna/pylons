import type { ArtifactBinding, DiagnosticSink, Host, PluginDefinition } from "@pylons/contracts";

export interface ArtifactMapping {
  readonly definition: PluginDefinition;
  readonly binding: ArtifactBinding;
  readonly host: Host;
  readonly publisherId: string;
  readonly container: string;
  readonly expose: string;
  readonly exportName: string;
  readonly profile: "single-script";
  readonly executableFiles: readonly string[];
}

export interface LoaderOptions {
  readonly operatorId: string;
  readonly trustedOperatorIds: readonly string[];
  readonly trustedPublisherIds: readonly string[];
  readonly trustedOrigins: readonly string[];
  readonly mappings: readonly ArtifactMapping[];
  readonly limits: {
    readonly timeoutMilliseconds: number;
    readonly maximumBytes: number;
    readonly maximumMappings: number;
    readonly maximumMetadataCharacters: number;
    readonly maximumReservations: number;
  };
  readonly diagnostics: DiagnosticSink;
}
