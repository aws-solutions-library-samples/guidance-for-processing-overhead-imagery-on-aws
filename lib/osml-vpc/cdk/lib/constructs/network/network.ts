/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  FlowLogDestination,
  FlowLogTrafficType,
  IVpc,
  SubnetType,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { BaseConfig, ConfigType, OSMLAccount, RegionalConfig } from "../types";

export class NetworkConfig extends BaseConfig {
  /**
   * The name to assign the creation of the VPC.
   * @default "osml-vpc"
   */
  public VPC_NAME?: string;

  /**
   * Unique identifier to import/use an existing VPC instead of creating a new one.
   */
  public VPC_ID?: string;

  /**
   * Define the maximum number of AZs for the VPC.
   */
  public MAX_AZS?: number;

  /**
   * Constructor for NetworkConfig.
   * @param config - The configuration object for the VPC.
   */
  constructor(config: ConfigType = {}) {
    super({
      // Set default values here
      VPC_NAME: "osml-vpc",
      ...config
    });
  }
}

/**
 * Properties for creating the VPC.
 */
export interface NetworkProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The custom configuration to be used when deploying this VPC. */
  readonly config?: NetworkConfig;
  /** Optional existing VPC to use directly instead of creating or looking up one. */
  readonly vpc?: IVpc;
}

/**
 * Simplified Network construct that only creates or imports a VPC.
 *
 * When creating a new VPC, it includes:
 * - Public subnets with Internet Gateway
 * - Private subnets with NAT Gateway
 * - VPC Flow Logs for compliance
 *
 * Components are responsible for creating their own security groups and selecting subnets.
 */
export class Network extends Construct {
  /** The VPC instance. */
  public readonly vpc: IVpc;

  /** The configuration of this construct. */
  public readonly config: NetworkConfig;

  /**
   * Creates a new Network construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    // Check if a custom configuration was provided
    if (props.config) {
      // Import existing passed-in configuration
      this.config = props.config;
    } else {
      // Create a new default configuration
      this.config = new NetworkConfig();
    }

    // Resolve VPC - import existing or create new one
    this.vpc = this.resolveVpc(props);
  }

  /**
   * Resolves a VPC based on configuration.
   * If a VPC is provided directly, uses it.
   * If VPC_ID is provided, imports the existing VPC.
   * Otherwise, creates a new VPC with default settings.
   *
   * @param props - The NetworkProps containing the VPC or configuration
   * @returns The VPC instance
   */
  private resolveVpc(props: NetworkProps): IVpc {
    // If VPC is provided directly, use it
    if (props.vpc) {
      return props.vpc;
    }

    if (this.config.VPC_ID) {
      // Import existing VPC
      return Vpc.fromLookup(this, "ImportedVPC", {
        vpcId: this.config.VPC_ID,
        isDefault: false
      });
    } else {
      const regionConfig = RegionalConfig.getConfig(props.account.region);

      // Create new VPC
      const vpc = new Vpc(this, "VPC", {
        vpcName: this.config.VPC_NAME,
        maxAzs: this.config.MAX_AZS ?? regionConfig.maxVpcAzs,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: `${this.config.VPC_NAME}-Public`,
            subnetType: SubnetType.PUBLIC
          },
          {
            cidrMask: 24,
            name: `${this.config.VPC_NAME}-Private`,
            subnetType: SubnetType.PRIVATE_WITH_EGRESS
          }
        ]
      });

      // Add VPC Flow Logs for compliance (required by AwsSolutions-VPC7)
      const flowLogGroup = new LogGroup(this, "VPCFlowLogGroup", {
        logGroupName: `/aws/vpc/flowlogs/${this.config.VPC_NAME}`,
        retention: props.account.prodLike
          ? RetentionDays.ONE_YEAR
          : RetentionDays.ONE_WEEK,
        removalPolicy: props.account.prodLike
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY
      });

      vpc.addFlowLog("VPCFlowLog", {
        destination: FlowLogDestination.toCloudWatchLogs(flowLogGroup),
        trafficType: FlowLogTrafficType.ALL
      });

      // Suppress cdk-nag findings for CDK-managed internal resources.
      const stack = Stack.of(this);

      // The VPC flow log IAM role is created automatically by CDK with
      // the minimum permissions needed to write to CloudWatch Logs.
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [`${this.node.path}/VPC/VPCFlowLog/IAMRole/DefaultPolicy/Resource`],
        [
          {
            id: "AwsSolutions-IAM5",
            reason:
              "CDK-managed flow log IAM role uses log:CreateLogStream and log:PutLogEvents " +
              "with a wildcard on the log group ARN stream suffix. This is the minimum " +
              "permission pattern for CloudWatch Logs delivery and cannot be scoped further."
          }
        ]
      );

      // The Custom::VpcRestrictDefaultSG Lambda is a CDK-internal custom resource
      // that restricts the default security group. Its IAM role and Lambda runtime
      // are managed by CDK and cannot be modified directly.
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "CDK-internal Custom::VpcRestrictDefaultSG Lambda uses AWS managed " +
            "AWSLambdaBasicExecutionRole policy. This is a CDK-managed resource " +
            "that cannot be customized.",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
          ]
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "CDK-internal Custom::VpcRestrictDefaultSG Lambda runtime version " +
            "is managed by CDK and cannot be customized."
        }
      ]);

      return vpc;
    }
  }
}
