/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { FlowLog, FlowLogResourceType, FlowLogDestination } from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface MRVpcStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly vpcName?: string;
  readonly vpcId?: string;
  readonly targetSubnets?: string[];
}

export class OSMLVpcStack extends Stack {
  public resources: OSMLVpc;

  /**
   * Constructor for the model runner vpc stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created OSMLVpcStack object
   */
  constructor(parent: App, name: string, props: MRVpcStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new OSMLVpc(this, "OSMLVpc", {
      vpcId: props.account.vpcId,
      account: props.account,
      vpcName: props.vpcName,
      targetSubnets: props.targetSubnets
    });
  }
}
