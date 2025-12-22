/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file NetworkStack for deploying VPC and networking infrastructure.
 *
 * This stack deploys the Network construct which includes:
 * - VPC with public and private subnets (or imports existing VPC)
 * - Security groups for Lambda authorizer
 * - VPC flow logs (for production environments)
 * - NAT Gateway for private subnet egress
 */

import { Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Network, NetworkConfig } from "./constructs/apis/network";

/**
 * Properties for the NetworkStack.
 */
export interface NetworkStackProps extends StackProps {
  /** The deployment configuration. */
  readonly deployment: DeploymentConfig;
  /** Optional existing VPC to import instead of creating a new one. */
  readonly vpc?: IVpc;
}

/**
 * Stack for deploying networking infrastructure for OSML APIs.
 *
 * This stack creates or imports the VPC and security groups needed
 * for the Lambda authorizer and API Gateway integrations.
 *
 * Requirements addressed:
 * - 1.5: Include a network-stack.ts for VPC lookup
 */
export class NetworkStack extends Stack {
  /** The network construct containing VPC and security groups. */
  public readonly network: Network;

  /**
   * Creates a new NetworkStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Create Network construct using deployment configuration
    // The Network construct will handle VPC import or creation based on the config
    const networkConfig = props.deployment.networkConfig ?? new NetworkConfig();
    this.network = new Network(this, "Network", {
      account: props.deployment.account,
      config: networkConfig,
      vpc: props.vpc
    });
  }
}
