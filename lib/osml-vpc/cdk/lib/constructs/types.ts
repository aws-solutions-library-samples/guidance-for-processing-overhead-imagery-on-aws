/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

/**
 * OSML Account configuration interface.
 */
export interface OSMLAccount {
  /** The AWS account ID. */
  readonly id: string;
  /** The AWS region. */
  readonly region: string;
  /** Whether this is a production-like environment. Defaults to false if not specified. */
  readonly prodLike?: boolean;
  /** Whether this is an ADC (Amazon Dedicated Cloud) environment. Defaults to false if not specified. */
  readonly isAdc?: boolean;
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
    "us-east-1": {
      s3Endpoint: "s3.amazonaws.com",
      maxVpcAzs: 3
    },
    "us-west-2": {
      s3Endpoint: "s3.us-west-2.amazonaws.com",
      maxVpcAzs: 3
    },
    "us-west-1": {
      s3Endpoint: "s3.us-west-1.amazonaws.com",
      maxVpcAzs: 2
    },
    "eu-west-1": {
      s3Endpoint: "s3.eu-west-1.amazonaws.com",
      maxVpcAzs: 3
    },
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
    "us-iso-east-1": {
      s3Endpoint: "s3.us-iso-east-1.c2s.ic.gov",
      maxVpcAzs: 2
    }
  };

  /**
   * Get regional configuration for a given region.
   *
   * @param region - The AWS region
   * @returns The regional configuration
   */
  static getConfig(region: string): RegionalConfigType {
    return this.configs[region] ?? this.configs["us-east-1"];
  }
}

/**
 * Base configuration type for OSML constructs.
 */
export type ConfigType = Record<string, unknown>;

/**
 * Base configuration class for OSML constructs.
 */
export abstract class BaseConfig<T extends ConfigType = ConfigType> {
  /**
   * Constructor for BaseConfig.
   *
   * @param config - The configuration object
   */
  constructor(config: Partial<T> = {}) {
    Object.assign(this, config);
  }
}
