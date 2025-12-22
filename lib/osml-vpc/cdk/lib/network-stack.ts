/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

/**
 * @file OSMLNetworkStack for deploying VPC and networking infrastructure.
 *
 * This stack deploys the Network construct which includes:
 * - VPC with public and private subnets
 * - Security groups
 * - VPC flow logs (for production environments)
 * - NAT Gateway for private subnet egress
 */

import { CfnOutput, Stack, StackProps, Tags } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Network, NetworkConfig } from "./constructs/network/network";

/**
 * Properties for the OSMLNetworkStack.
 */
export interface OSMLNetworkStackProps extends StackProps {
  /** The deployment configuration. */
  deployment: DeploymentConfig;
  /** Optional existing VPC to import instead of creating a new one. */
  vpc?: IVpc;
}

/**
 * Stack for deploying VPC infrastructure only.
 * Components are responsible for creating their own security groups.
 */
export class OSMLNetworkStack extends Stack {
  /** The network construct containing VPC. */
  public readonly network: Network;

  /**
   * Creates a new OSMLNetworkStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: Construct, id: string, props: OSMLNetworkStackProps) {
    super(scope, id, {
      ...props,
      description: `${props.deployment.projectName}, Guidance for Processing Overhead Imagery on AWS (SO9240)`
    });

    // Create or import VPC based on deployment configuration
    const networkConfig = props.deployment.networkConfig ?? new NetworkConfig();

    this.network = new Network(this, "Network", {
      account: props.deployment.account,
      config: networkConfig,
      vpc: props.vpc
    });

    // Add tags
    Tags.of(this).add("Project", "OSML");
    Tags.of(this).add("Component", "Network");
    if (props.deployment.account.prodLike) {
      Tags.of(this).add("Environment", "Production");
    }

    // Export VPC ID
    new CfnOutput(this, "VpcId", {
      value: this.network.vpc.vpcId,
      description: "VPC ID",
      exportName: `${this.stackName}-VpcId`
    });

    // Export VPC ARN
    new CfnOutput(this, "VpcArn", {
      value: this.network.vpc.vpcArn,
      description: "VPC ARN",
      exportName: `${this.stackName}-VpcArn`
    });

    // Export public subnet IDs
    const publicSubnetIds = this.network.vpc.publicSubnets
      .map((subnet) => subnet.subnetId)
      .join(",");
    new CfnOutput(this, "PublicSubnetIds", {
      value: publicSubnetIds,
      description: "Comma-separated list of public subnet IDs",
      exportName: `${this.stackName}-PublicSubnetIds`
    });

    // Export private subnet IDs
    const privateSubnetIds = this.network.vpc.privateSubnets
      .map((subnet) => subnet.subnetId)
      .join(",");
    new CfnOutput(this, "PrivateSubnetIds", {
      value: privateSubnetIds,
      description: "Comma-separated list of private subnet IDs",
      exportName: `${this.stackName}-PrivateSubnetIds`
    });

    // Export availability zones
    const availabilityZones = this.network.vpc.availabilityZones.join(",");
    new CfnOutput(this, "AvailabilityZones", {
      value: availabilityZones,
      description: "Comma-separated list of availability zones",
      exportName: `${this.stackName}-AvailabilityZones`
    });
  }
}
