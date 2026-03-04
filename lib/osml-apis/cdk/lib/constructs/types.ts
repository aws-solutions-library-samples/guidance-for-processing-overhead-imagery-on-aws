/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Shared types for OSML APIs CDK constructs.
 */

/**
 * OSML Account configuration interface.
 */
export interface OSMLAccount {
  /** The AWS account ID. */
  readonly id: string;
  /** The AWS region. */
  readonly region: string;
  /** Whether this is a production-like environment. */
  readonly prodLike: boolean;
  /** Whether this is an ADC (Amazon Dedicated Cloud) environment. */
  readonly isAdc: boolean;
}

/**
 * Authentication configuration for JWT validation.
 * Compatible with OSMLAuth from osml-cdk-constructs.
 */
export interface AuthConfig {
  /** OIDC authority URL (Keycloak issuer) */
  readonly authority: string;
  /** Expected JWT audience */
  readonly audience: string;
}

/**
 * Base configuration type for OSML constructs.
 */
export type ConfigType = Record<string, unknown>;

/**
 * Base configuration class for OSML constructs.
 */
export abstract class BaseConfig {
  constructor(config: Partial<ConfigType> = {}) {
    Object.assign(this, config);
  }
}

/**
 * Configuration for the OSML APIs dataplane.
 */
export class DataplaneConfig extends BaseConfig {
  authConfig?: AuthConfig;
  TILE_SERVER_URL?: string;
  TILE_SERVER_ALB_ARN?: string;
  DATA_INTAKE_LAMBDA_ARN?: string;
  GEO_AGENTS_MCP_URL?: string;
  GEO_AGENTS_ALB_ARN?: string;
  CORS_ALLOWED_ORIGINS?: string[];
  DOMAIN_HOSTED_ZONE_ID?: string;
  DOMAIN_HOSTED_ZONE_NAME?: string;
  DOMAIN_CERTIFICATE_ARN?: string;

  constructor(config: ConfigType = {}) {
    super(config);
  }
}

/**
 * Regional configuration interface.
 */
export interface RegionalConfigType {
  s3Endpoint: string;
  maxVpcAzs: number;
}

/**
 * Regional configuration for AWS services.
 */
export class RegionalConfig {
  private static readonly configs: Record<string, RegionalConfigType> = {
    "us-east-1": { s3Endpoint: "s3.amazonaws.com", maxVpcAzs: 3 },
    "us-west-2": { s3Endpoint: "s3.us-west-2.amazonaws.com", maxVpcAzs: 3 },
    "us-west-1": { s3Endpoint: "s3.us-west-1.amazonaws.com", maxVpcAzs: 2 },
    "eu-west-1": { s3Endpoint: "s3.eu-west-1.amazonaws.com", maxVpcAzs: 3 },
    "ap-southeast-1": {
      s3Endpoint: "s3.ap-southeast-1.amazonaws.com",
      maxVpcAzs: 3
    },
    "us-gov-west-1": {
      s3Endpoint: "s3.us-gov-west-1.amazonaws.com",
      maxVpcAzs: 2
    },
    "us-gov-east-1": {
      s3Endpoint: "s3.us-gov-east-1.amazonaws.com",
      maxVpcAzs: 2
    },
    "us-isob-east-1": {
      s3Endpoint: "s3.us-isob-east-1.sc2s.sgov.gov",
      maxVpcAzs: 2
    },
    "us-iso-east-1": { s3Endpoint: "s3.us-iso-east-1.c2s.ic.gov", maxVpcAzs: 2 }
  };

  static getConfig(region: string): RegionalConfigType {
    return this.configs[region] || this.configs["us-east-1"];
  }
}
