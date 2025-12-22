/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Utility to load and validate the deployment configuration file.
 *
 * This module provides a strongly typed interface for reading the `deployment.json`
 * configuration, performing required validations, and returning a structured result.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { NetworkConfig } from "../../lib/constructs/apis/network";
import { AuthConfig, DataplaneConfig } from "../../lib/constructs/types";

/**
 * Represents the structure of the deployment configuration file.
 */
export interface DeploymentConfig {
  /** Logical name of the project, used for the CDK stack ID. */
  projectName: string;

  /** AWS account configuration. */
  account: {
    /** AWS Account ID. */
    id: string;
    /** AWS region for deployment. */
    region: string;
    /** Whether the account is prod-like. */
    prodLike: boolean;
    /** Whether this is an ADC (Application Data Center) environment. */
    isAdc: boolean;
  };

  /** Networking configuration. If VPC_ID is provided, an existing VPC will be imported. */
  networkConfig?: NetworkConfig;

  /** OSML APIs dataplane configuration. */
  dataplaneConfig?: DataplaneConfig;
}

/**
 * Validation error class for deployment configuration issues.
 */
class DeploymentConfigError extends Error {
  /**
   * Creates a new DeploymentConfigError.
   *
   * @param message - The error message
   * @param field - Optional field name that caused the error
   */
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public field?: string
  ) {
    super(message);
    this.name = "DeploymentConfigError";
  }
}

/**
 * Validates and trims a string field, checking for required value and whitespace.
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @param isRequired - Whether the field is required (default: true)
 * @returns The trimmed string value
 * @throws {DeploymentConfigError} If validation fails
 */
function validateStringField(
  value: unknown,
  fieldName: string,
  isRequired: boolean = true
): string {
  if (value === undefined || value === null) {
    if (isRequired) {
      throw new DeploymentConfigError(
        `Missing required field: ${fieldName}`,
        fieldName
      );
    }
    return "";
  }

  if (typeof value !== "string") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' must be a string, got ${typeof value}`,
      fieldName
    );
  }

  const trimmed = value.trim();
  if (isRequired && trimmed === "") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' cannot be empty or contain only whitespace`,
      fieldName
    );
  }

  return trimmed;
}

/**
 * Validates a boolean field, checking for correct type.
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @param isRequired - Whether the field is required (default: true)
 * @param defaultValue - Default value to return if field is not provided and not required
 * @returns The validated boolean value
 * @throws {DeploymentConfigError} If validation fails
 */
function validateBooleanField(
  value: unknown,
  fieldName: string,
  isRequired: boolean = true,
  defaultValue?: boolean
): boolean {
  if (value === undefined || value === null) {
    if (isRequired) {
      throw new DeploymentConfigError(
        `Missing required field: ${fieldName}`,
        fieldName
      );
    }
    return defaultValue ?? false;
  }

  if (typeof value !== "boolean") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' must be a boolean, got ${typeof value}`,
      fieldName
    );
  }

  return value;
}

/**
 * Validates AWS account ID format.
 *
 * @param accountId - The account ID to validate
 * @returns The validated account ID
 * @throws {DeploymentConfigError} If the account ID format is invalid
 */
function validateAccountId(accountId: string): string {
  if (!/^\d{12}$/.test(accountId)) {
    throw new DeploymentConfigError(
      `Invalid AWS account ID format: '${accountId}'. Must be exactly 12 digits.`,
      "account.id"
    );
  }
  return accountId;
}

/**
 * Validates AWS region format using pattern matching.
 *
 * @param region - The region to validate
 * @returns The validated region
 * @throws {DeploymentConfigError} If the region format is invalid
 */
function validateRegion(region: string): string {
  // AWS region pattern: letters/numbers, hyphen, letters/numbers, optional hyphen and numbers
  if (!/^[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region)) {
    throw new DeploymentConfigError(
      `Invalid AWS region format: '${region}'. Must follow pattern like 'us-east-1', 'eu-west-2', etc.`,
      "account.region"
    );
  }
  return region;
}

/**
 * Validates VPC ID format.
 *
 * @param vpcId - The VPC ID to validate
 * @returns The validated VPC ID
 * @throws {DeploymentConfigError} If the VPC ID format is invalid
 */
function validateVpcId(vpcId: string): string {
  if (!/^vpc-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(vpcId)) {
    throw new DeploymentConfigError(
      `Invalid VPC ID format: '${vpcId}'. Must start with 'vpc-' followed by 8 or 17 hexadecimal characters.`,
      "networkConfig.VPC_ID"
    );
  }
  return vpcId;
}

/**
 * Validates security group ID format.
 *
 * @param securityGroupId - The security group ID to validate
 * @returns The validated security group ID
 * @throws {DeploymentConfigError} If the security group ID format is invalid
 */
function validateSecurityGroupId(securityGroupId: string): string {
  if (!/^sg-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(securityGroupId)) {
    throw new DeploymentConfigError(
      `Invalid security group ID format: '${securityGroupId}'. Must start with 'sg-' followed by 8 or 17 hexadecimal characters.`,
      "networkConfig.SECURITY_GROUP_ID"
    );
  }
  return securityGroupId;
}

/**
 * Validates subnet ID format.
 *
 * @param subnetId - The subnet ID to validate
 * @returns The validated subnet ID
 * @throws {DeploymentConfigError} If the subnet ID format is invalid
 */
function validateSubnetId(subnetId: string): string {
  if (!/^subnet-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(subnetId)) {
    throw new DeploymentConfigError(
      `Invalid Subnet ID format: '${subnetId}'. Must start with 'subnet-' followed by 8 or 17 hexadecimal characters.`,
      "networkConfig.TARGET_SUBNETS"
    );
  }
  return subnetId;
}

/**
 * Validates a URL format.
 *
 * @param url - The URL to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @returns The validated URL
 * @throws {DeploymentConfigError} If the URL format is invalid
 */
function validateUrl(url: string, fieldName: string): string {
  try {
    new URL(url);
    return url;
  } catch {
    throw new DeploymentConfigError(
      `Invalid URL format for '${fieldName}': '${url}'.`,
      fieldName
    );
  }
}

/**
 * Validates a Lambda ARN format.
 *
 * @param arn - The ARN to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @returns The validated ARN
 * @throws {DeploymentConfigError} If the ARN format is invalid
 */
function validateLambdaArn(arn: string, fieldName: string): string {
  if (!/^arn:aws:lambda:[a-z0-9-]+:\d{12}:function:[a-zA-Z0-9_-]+$/.test(arn)) {
    throw new DeploymentConfigError(
      `Invalid Lambda ARN format for '${fieldName}': '${arn}'. Must follow pattern 'arn:aws:lambda:region:account:function:name'.`,
      fieldName
    );
  }
  return arn;
}

/**
 * Validates an ACM certificate ARN format.
 *
 * @param arn - The ARN to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @returns The validated ARN
 * @throws {DeploymentConfigError} If the ARN format is invalid
 */
function validateCertificateArn(arn: string, fieldName: string): string {
  if (!/^arn:aws:acm:[a-z0-9-]+:\d{12}:certificate\/[a-f0-9-]+$/.test(arn)) {
    throw new DeploymentConfigError(
      `Invalid ACM certificate ARN format for '${fieldName}': '${arn}'. Must follow pattern 'arn:aws:acm:region:account:certificate/id'.`,
      fieldName
    );
  }
  return arn;
}

/**
 * Validates that a string is a valid AWS Load Balancer ARN.
 *
 * @param arn - The ARN to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @returns The validated ARN
 * @throws {DeploymentConfigError} If the ARN format is invalid
 */
function validateLoadBalancerArn(arn: string, fieldName: string): string {
  if (
    !/^arn:aws:elasticloadbalancing:[a-z0-9-]+:\d{12}:loadbalancer\/app\/[a-zA-Z0-9-]+\/[a-f0-9]+$/.test(
      arn
    )
  ) {
    throw new DeploymentConfigError(
      `Invalid Load Balancer ARN format for '${fieldName}': '${arn}'. Must follow pattern 'arn:aws:elasticloadbalancing:region:account:loadbalancer/app/name/id'.`,
      fieldName
    );
  }
  return arn;
}

/**
 * Validates and parses the authConfig section.
 *
 * @param authConfigData - The raw auth config data
 * @returns The validated AuthConfig object
 * @throws {DeploymentConfigError} If validation fails
 */
function validateAuthConfig(authConfigData: unknown): AuthConfig {
  if (!authConfigData || typeof authConfigData !== "object") {
    throw new DeploymentConfigError(
      "Missing or invalid dataplaneConfig.authConfig section in deployment.json",
      "dataplaneConfig.authConfig"
    );
  }

  const authConfig = authConfigData as Record<string, unknown>;

  const authority = validateStringField(
    authConfig.authority,
    "dataplaneConfig.authConfig.authority"
  );
  validateUrl(authority, "dataplaneConfig.authConfig.authority");

  const audience = validateStringField(
    authConfig.audience,
    "dataplaneConfig.authConfig.audience"
  );

  return { authority, audience };
}

/**
 * Validates and parses the dataplaneConfig section.
 *
 * @param dataplaneData - The raw dataplane config data
 * @returns The validated DataplaneConfig object
 * @throws {DeploymentConfigError} If validation fails
 */
function validateDataplaneConfig(dataplaneData: unknown): DataplaneConfig {
  if (!dataplaneData || typeof dataplaneData !== "object") {
    return new DataplaneConfig();
  }

  const dataplane = dataplaneData as Record<string, unknown>;
  const configData: Record<string, unknown> = {};

  // Validate authConfig (required within dataplaneConfig)
  if (dataplane.authConfig) {
    configData.authConfig = validateAuthConfig(dataplane.authConfig);
  }

  // Validate TILE_SERVER_URL (optional)
  if (dataplane.TILE_SERVER_URL !== undefined) {
    const tileServerUrl = validateStringField(
      dataplane.TILE_SERVER_URL,
      "dataplaneConfig.TILE_SERVER_URL",
      false
    );
    if (tileServerUrl) {
      validateUrl(tileServerUrl, "dataplaneConfig.TILE_SERVER_URL");
      configData.TILE_SERVER_URL = tileServerUrl;
    }
  }

  // Validate TILE_SERVER_ALB_ARN (optional)
  if (dataplane.TILE_SERVER_ALB_ARN !== undefined) {
    const tileServerAlbArn = validateStringField(
      dataplane.TILE_SERVER_ALB_ARN,
      "dataplaneConfig.TILE_SERVER_ALB_ARN",
      false
    );
    if (tileServerAlbArn) {
      validateLoadBalancerArn(
        tileServerAlbArn,
        "dataplaneConfig.TILE_SERVER_ALB_ARN"
      );
      configData.TILE_SERVER_ALB_ARN = tileServerAlbArn;
    }
  }

  // Validate DATA_INTAKE_LAMBDA_ARN (optional)
  if (dataplane.DATA_INTAKE_LAMBDA_ARN !== undefined) {
    const dataIntakeLambdaArn = validateStringField(
      dataplane.DATA_INTAKE_LAMBDA_ARN,
      "dataplaneConfig.DATA_INTAKE_LAMBDA_ARN",
      false
    );
    if (dataIntakeLambdaArn) {
      validateLambdaArn(
        dataIntakeLambdaArn,
        "dataplaneConfig.DATA_INTAKE_LAMBDA_ARN"
      );
      configData.DATA_INTAKE_LAMBDA_ARN = dataIntakeLambdaArn;
    }
  }

  // Validate GEO_AGENTS_MCP_URL (optional)
  if (dataplane.GEO_AGENTS_MCP_URL !== undefined) {
    const geoAgentsMcpUrl = validateStringField(
      dataplane.GEO_AGENTS_MCP_URL,
      "dataplaneConfig.GEO_AGENTS_MCP_URL",
      false
    );
    if (geoAgentsMcpUrl) {
      validateUrl(geoAgentsMcpUrl, "dataplaneConfig.GEO_AGENTS_MCP_URL");
      configData.GEO_AGENTS_MCP_URL = geoAgentsMcpUrl;
    }
  }

  // Validate GEO_AGENTS_ALB_ARN (optional)
  if (dataplane.GEO_AGENTS_ALB_ARN !== undefined) {
    const geoAgentsAlbArn = validateStringField(
      dataplane.GEO_AGENTS_ALB_ARN,
      "dataplaneConfig.GEO_AGENTS_ALB_ARN",
      false
    );
    if (geoAgentsAlbArn) {
      validateLoadBalancerArn(
        geoAgentsAlbArn,
        "dataplaneConfig.GEO_AGENTS_ALB_ARN"
      );
      configData.GEO_AGENTS_ALB_ARN = geoAgentsAlbArn;
    }
  }

  // Validate CORS_ALLOWED_ORIGINS (optional array)
  if (dataplane.CORS_ALLOWED_ORIGINS !== undefined) {
    if (!Array.isArray(dataplane.CORS_ALLOWED_ORIGINS)) {
      throw new DeploymentConfigError(
        "Field 'dataplaneConfig.CORS_ALLOWED_ORIGINS' must be an array",
        "dataplaneConfig.CORS_ALLOWED_ORIGINS"
      );
    }
    const corsOrigins: string[] = [];
    for (const origin of dataplane.CORS_ALLOWED_ORIGINS) {
      const validatedOrigin = validateStringField(
        origin,
        "dataplaneConfig.CORS_ALLOWED_ORIGINS[]",
        false
      );
      if (validatedOrigin) {
        corsOrigins.push(validatedOrigin);
      }
    }
    if (corsOrigins.length > 0) {
      configData.CORS_ALLOWED_ORIGINS = corsOrigins;
    }
  }

  // Validate DOMAIN_HOSTED_ZONE_ID (optional)
  const hostedZoneId = validateStringField(
    dataplane.DOMAIN_HOSTED_ZONE_ID,
    "dataplaneConfig.DOMAIN_HOSTED_ZONE_ID",
    false
  );

  // Validate DOMAIN_HOSTED_ZONE_NAME (optional)
  const hostedZoneName = validateStringField(
    dataplane.DOMAIN_HOSTED_ZONE_NAME,
    "dataplaneConfig.DOMAIN_HOSTED_ZONE_NAME",
    false
  );

  // Validate that both DOMAIN_HOSTED_ZONE_ID and DOMAIN_HOSTED_ZONE_NAME are provided together
  if (hostedZoneId && !hostedZoneName) {
    throw new DeploymentConfigError(
      "DOMAIN_HOSTED_ZONE_NAME is required when DOMAIN_HOSTED_ZONE_ID is provided",
      "dataplaneConfig.DOMAIN_HOSTED_ZONE_NAME"
    );
  }
  if (hostedZoneName && !hostedZoneId) {
    throw new DeploymentConfigError(
      "DOMAIN_HOSTED_ZONE_ID is required when DOMAIN_HOSTED_ZONE_NAME is provided",
      "dataplaneConfig.DOMAIN_HOSTED_ZONE_ID"
    );
  }

  if (hostedZoneId && hostedZoneName) {
    configData.DOMAIN_HOSTED_ZONE_ID = hostedZoneId;
    configData.DOMAIN_HOSTED_ZONE_NAME = hostedZoneName;
  }

  // Validate DOMAIN_CERTIFICATE_ARN (optional)
  if (dataplane.DOMAIN_CERTIFICATE_ARN !== undefined) {
    const certificateArn = validateStringField(
      dataplane.DOMAIN_CERTIFICATE_ARN,
      "dataplaneConfig.DOMAIN_CERTIFICATE_ARN",
      false
    );
    if (certificateArn) {
      validateCertificateArn(
        certificateArn,
        "dataplaneConfig.DOMAIN_CERTIFICATE_ARN"
      );
      configData.DOMAIN_CERTIFICATE_ARN = certificateArn;
    }
  }

  return new DataplaneConfig(configData);
}

/**
 * Loads and validates the deployment configuration from `deployment/deployment.json`.
 *
 * @returns A validated {@link DeploymentConfig} object
 * @throws {DeploymentConfigError} If the file is missing, malformed, or contains invalid values
 */
export function loadDeploymentConfig(): DeploymentConfig {
  const deploymentPath = join(__dirname, "deployment.json");

  if (!existsSync(deploymentPath)) {
    throw new DeploymentConfigError(
      `Missing deployment.json file at ${deploymentPath}. Please create it by copying deployment.json.example`
    );
  }

  let parsed: unknown;
  try {
    const rawContent = readFileSync(deploymentPath, "utf-8");
    parsed = JSON.parse(rawContent);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DeploymentConfigError(
        `Invalid JSON format in deployment.json: ${error.message}`
      );
    }
    throw new DeploymentConfigError(
      `Failed to read deployment.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  // Validate top-level structure
  if (!parsed || typeof parsed !== "object") {
    throw new DeploymentConfigError(
      "deployment.json must contain a valid JSON object"
    );
  }

  const rawConfig = parsed as Record<string, unknown>;

  // Validate project name
  const projectName = validateStringField(rawConfig.projectName, "projectName");
  if (projectName.length === 0) {
    throw new DeploymentConfigError("projectName cannot be empty");
  }

  // Validate account section
  if (!rawConfig.account || typeof rawConfig.account !== "object") {
    throw new DeploymentConfigError(
      "Missing or invalid account section in deployment.json",
      "account"
    );
  }

  const accountConfig = rawConfig.account as Record<string, unknown>;

  const accountId = validateAccountId(
    validateStringField(accountConfig.id, "account.id")
  );
  const region = validateRegion(
    validateStringField(accountConfig.region, "account.region")
  );
  const prodLike = validateBooleanField(
    accountConfig.prodLike,
    "account.prodLike"
  );
  const isAdc = validateBooleanField(
    accountConfig.isAdc,
    "account.isAdc",
    false,
    false
  );

  // Parse optional Network configuration
  let networkConfig: DeploymentConfig["networkConfig"] = undefined;
  if (
    rawConfig.networkConfig &&
    typeof rawConfig.networkConfig === "object" &&
    rawConfig.networkConfig !== null
  ) {
    const networkConfigData = rawConfig.networkConfig as Record<
      string,
      unknown
    >;

    // Validate VPC_ID format if provided
    if (networkConfigData.VPC_ID !== undefined) {
      validateVpcId(
        validateStringField(networkConfigData.VPC_ID, "networkConfig.VPC_ID")
      );
    }

    // Validate TARGET_SUBNETS is an array if provided
    if (networkConfigData.TARGET_SUBNETS !== undefined) {
      if (!Array.isArray(networkConfigData.TARGET_SUBNETS)) {
        throw new DeploymentConfigError(
          "Field 'networkConfig.TARGET_SUBNETS' must be an array",
          "networkConfig.TARGET_SUBNETS"
        );
      }
      // Validate each subnet ID format
      for (const subnetId of networkConfigData.TARGET_SUBNETS) {
        validateSubnetId(
          validateStringField(subnetId, "networkConfig.TARGET_SUBNETS[]")
        );
      }
    }

    // Validate SECURITY_GROUP_ID format if provided
    if (networkConfigData.SECURITY_GROUP_ID !== undefined) {
      validateSecurityGroupId(
        validateStringField(
          networkConfigData.SECURITY_GROUP_ID,
          "networkConfig.SECURITY_GROUP_ID"
        )
      );
    }

    // Validate that TARGET_SUBNETS is required when VPC_ID is provided
    if (
      networkConfigData.VPC_ID &&
      (!networkConfigData.TARGET_SUBNETS ||
        !Array.isArray(networkConfigData.TARGET_SUBNETS) ||
        networkConfigData.TARGET_SUBNETS.length === 0)
    ) {
      throw new DeploymentConfigError(
        "When VPC_ID is provided, TARGET_SUBNETS must also be specified with at least one subnet ID",
        "networkConfig.TARGET_SUBNETS"
      );
    }

    // Create NetworkConfig instance with all properties passed through
    networkConfig = new NetworkConfig(networkConfigData);
  }

  // Parse optional dataplaneConfig section
  let dataplaneConfig: DataplaneConfig | undefined = undefined;
  if (
    rawConfig.dataplaneConfig &&
    typeof rawConfig.dataplaneConfig === "object" &&
    rawConfig.dataplaneConfig !== null
  ) {
    dataplaneConfig = validateDataplaneConfig(rawConfig.dataplaneConfig);
  }

  const validatedConfig: DeploymentConfig = {
    projectName,
    account: {
      id: accountId,
      region: region,
      prodLike: prodLike,
      isAdc: isAdc
    },
    networkConfig,
    dataplaneConfig
  };

  // Only log non-sensitive configuration details
  console.log(
    `Using environment from deployment.json: projectName=${validatedConfig.projectName}, region=${validatedConfig.account.region}`
  );

  return validatedConfig;
}
