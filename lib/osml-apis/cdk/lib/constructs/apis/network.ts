/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";
import {
  FlowLogDestination,
  FlowLogTrafficType,
  ISecurityGroup,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetFilter,
  SubnetSelection,
  SubnetType,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { BaseConfig, ConfigType, OSMLAccount, RegionalConfig } from "../types";

/**
 * Network configuration class for OSML APIs.
 */
export class NetworkConfig extends BaseConfig {
  /**
   * The name to assign the creation of the VPC.
   * @default "osml-apis-vpc"
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
   * Specifies an optional list of subnet IDs to specifically target within the VPC.
   */
  public TARGET_SUBNETS?: string[];

  /**
   * Unique identifier to import/use an existing security group instead of creating a new one.
   */
  public SECURITY_GROUP_ID?: string;

  /**
   * The name to assign the creation of the security group.
   * @default "osml-apis-security-group"
   */
  public SECURITY_GROUP_NAME?: string;

  /**
   * Constructor for NetworkConfig.
   * @param config - The configuration object for the network.
   */
  constructor(config: ConfigType = {}) {
    super({
      // Set default values here
      VPC_NAME: "osml-apis-vpc",
      SECURITY_GROUP_NAME: "osml-apis-security-group",
      ...config
    });
  }
}

/**
 * Properties for the Network construct.
 */
export interface NetworkProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The custom configuration to be used when deploying this network. */
  readonly config?: NetworkConfig;
  /** Optional existing VPC to use directly instead of creating or looking up one. */
  readonly vpc?: IVpc;
}

/**
 * Network construct that can either import an existing VPC or create a new one.
 *
 * When creating a new VPC, it includes:
 * - Public subnets with Internet Gateway
 * - Private subnets with NAT Gateway
 * - Security group with allowAllOutbound enabled
 *
 * When importing an existing VPC, it can also import an existing security group
 * by providing the SECURITY_GROUP_ID in the configuration.
 */
export class Network extends Construct {
  /** The VPC instance. */
  public readonly vpc: IVpc;
  /** The selected subnets based on configuration. */
  public readonly selectedSubnets: SubnetSelection;
  /** The default security group for the VPC. */
  public readonly securityGroup: ISecurityGroup;
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

    // Resolve security group - import existing or create new one
    this.securityGroup = this.resolveSecurityGroup();

    // Select subnets based on configuration
    this.selectedSubnets = this.resolveSubnets();
  }

  /**
   * Selects subnets within the VPC based on user specifications.
   * If target subnets are provided, those are selected; otherwise,
   * it defaults to selecting all private subnets with egress.
   *
   * @returns The selected subnet selection
   */
  private resolveSubnets(): SubnetSelection {
    // If specified subnets are provided, use them
    if (this.config.TARGET_SUBNETS) {
      return this.vpc.selectSubnets({
        subnetFilters: [SubnetFilter.byIds(this.config.TARGET_SUBNETS)]
      });
    } else {
      // Otherwise, select all private subnets
      return this.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_WITH_EGRESS
      });
    }
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

      return vpc;
    }
  }

  /**
   * Resolves a security group based on configuration.
   * If SECURITY_GROUP_ID is provided, imports the existing security group.
   * Otherwise, creates a new security group with default settings.
   *
   * @returns The security group instance
   */
  private resolveSecurityGroup(): ISecurityGroup {
    if (this.config.SECURITY_GROUP_ID) {
      // Import existing security group
      return SecurityGroup.fromSecurityGroupId(
        this,
        "ImportedSecurityGroup",
        this.config.SECURITY_GROUP_ID
      );
    } else {
      // Create new security group with outbound access
      const sg = new SecurityGroup(this, "SecurityGroup", {
        securityGroupName: this.config.SECURITY_GROUP_NAME,
        vpc: this.vpc,
        description: "Security group for OSML APIs with outbound access",
        allowAllOutbound: true
      });

      // Add ingress rule for HTTPS traffic within VPC (for auth server access)
      sg.addIngressRule(
        Peer.ipv4(this.vpc.vpcCidrBlock),
        Port.tcp(443),
        "Allow inbound HTTPS traffic within VPC"
      );

      // Suppress CDK NAG validation failure for security group CIDR check
      // The security group uses vpc.vpcCidrBlock which is a CloudFormation token
      // CDK NAG cannot validate tokens at synth time, but the actual CIDR is scoped to the VPC
      NagSuppressions.addResourceSuppressions(
        sg,
        [
          {
            id: "CdkNagValidationFailure",
            reason:
              "Security group ingress rules use vpc.vpcCidrBlock which resolves to a CloudFormation intrinsic function at synth time. CDK NAG cannot validate tokens. The actual CIDR is scoped to the VPC CIDR block (e.g., 10.0.0.0/16), not 0.0.0.0/0"
          }
        ],
        true
      );

      return sg;
    }
  }
}
