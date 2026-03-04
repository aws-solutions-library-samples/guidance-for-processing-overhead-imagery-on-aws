/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

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

import { NetworkConfig } from "../../lib/constructs/network/network";
import { OSMLAccount } from "../../lib/constructs/types";

/**
 * Represents the structure of the deployment configuration file.
 */
export interface DeploymentConfig {
  /** Project name used for stack naming and tagging. */
  projectName: string;
  /** AWS account configuration. */
  account: OSMLAccount;
  /** Networking configuration. If VPC_ID is provided, an existing VPC will be imported. Otherwise, a new VPC will be created. */
  networkConfig?: NetworkConfig;
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
      "networkConfig.vpcId"
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
      "networkConfig.securityGroupId"
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
      "networkConfig.targetSubnets"
    );
  }
  return subnetId;
}

/**
 * Loads and validates the deployment configuration from `deployment/deployment.json`.
 *
 * @returns A validated DeploymentConfig object
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

  const config = parsed as Record<string, unknown>;

  // Validate projectName
  const projectName = validateStringField(config.projectName, "projectName");

  // Validate account section
  if (!config.account || typeof config.account !== "object") {
    throw new DeploymentConfigError(
      "Missing or invalid account section in deployment.json",
      "account"
    );
  }

  const accountConfig = config.account as Record<string, unknown>;
  const accountId = validateAccountId(
    validateStringField(accountConfig.id, "account.id")
  );
  const region = validateRegion(
    validateStringField(accountConfig.region, "account.region")
  );
  const prodLike = validateBooleanField(
    accountConfig.prodLike,
    "account.prodLike",
    false,
    false
  );
  const isAdc = validateBooleanField(
    accountConfig.isAdc,
    "account.isAdc",
    false,
    false
  );

  // Parse and validate networking configuration
  let networkConfig: NetworkConfig | undefined = undefined;
  if (config.networkConfig && typeof config.networkConfig === "object") {
    const networkConfigRaw = config.networkConfig as Record<string, unknown>;

    // Validate VPC ID if provided
    let vpcId: string | undefined = undefined;
    if (
      networkConfigRaw.vpcId !== undefined &&
      networkConfigRaw.vpcId !== null
    ) {
      vpcId = validateVpcId(
        validateStringField(networkConfigRaw.vpcId, "networkConfig.vpcId")
      );
    }

    // Validate target subnets if provided
    let targetSubnets: string[] | undefined = undefined;
    if (
      networkConfigRaw.targetSubnets !== undefined &&
      networkConfigRaw.targetSubnets !== null
    ) {
      if (!Array.isArray(networkConfigRaw.targetSubnets)) {
        throw new DeploymentConfigError(
          "Field 'networkConfig.targetSubnets' must be an array",
          "networkConfig.targetSubnets"
        );
      }
      targetSubnets = networkConfigRaw.targetSubnets.map(
        (subnetId: unknown, index: number) =>
          validateSubnetId(
            validateStringField(
              subnetId,
              `networkConfig.targetSubnets[${index}]`
            )
          )
      );
    }

    // Validate security group ID if provided
    let securityGroupId: string | undefined = undefined;
    if (
      networkConfigRaw.securityGroupId !== undefined &&
      networkConfigRaw.securityGroupId !== null
    ) {
      securityGroupId = validateSecurityGroupId(
        validateStringField(
          networkConfigRaw.securityGroupId,
          "networkConfig.securityGroupId"
        )
      );
    }

    // Validate that TARGET_SUBNETS is required when VPC_ID is provided
    if (vpcId && (!targetSubnets || targetSubnets.length === 0)) {
      throw new DeploymentConfigError(
        "When vpcId is provided, targetSubnets must also be specified with at least one subnet ID",
        "networkConfig.targetSubnets"
      );
    }

    // Create the network config data object
    const networkConfigData: Record<string, unknown> = {};
    if (vpcId) networkConfigData.VPC_ID = vpcId;
    if (targetSubnets) networkConfigData.TARGET_SUBNETS = targetSubnets;
    if (securityGroupId) networkConfigData.SECURITY_GROUP_ID = securityGroupId;

    // Create NetworkConfig instance
    networkConfig = new NetworkConfig(networkConfigData);
  }

  const validatedConfig: DeploymentConfig = {
    projectName: projectName,
    account: {
      id: accountId,
      region: region,
      prodLike: prodLike,
      isAdc: isAdc
    },
    networkConfig
  };

  // Only log non-sensitive configuration details
  console.log(
    `Using environment from deployment.json: region=${validatedConfig.account.region}`
  );

  return validatedConfig;
}
