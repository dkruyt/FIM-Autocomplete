/**
 * Per-request HTTP options.
 *
 * Upstream Continue derived these from a zod schema in `@continuedev/config-types`,
 * a package describing its whole config file format. This fork only ever needed
 * `RequestOptions`, so the type is declared directly and the dependency (along
 * with its `zod` runtime cost) is gone.
 */

export interface ClientCertificateOptions {
  cert: string;
  key: string;
  passphrase?: string;
}

export interface RequestOptions {
  timeout?: number;
  verifySsl?: boolean;
  caBundlePath?: string | string[];
  proxy?: string;
  headers?: Record<string, string>;
  extraBodyProperties?: Record<string, any>;
  noProxy?: string[];
  clientCertificate?: ClientCertificateOptions;
}
