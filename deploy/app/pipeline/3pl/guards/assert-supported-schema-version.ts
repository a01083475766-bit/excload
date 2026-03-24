const SUPPORTED_SCHEMA_VERSION = "3pl-template-analysis.v1";

/**
 * Stage2는 지원하는 Stage1 산출물 스키마 버전만 처리한다.
 */
export function assertSupportedSchemaVersion(version: string): void {
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version: ${version}. Supported: ${SUPPORTED_SCHEMA_VERSION}.`
    );
  }
}
