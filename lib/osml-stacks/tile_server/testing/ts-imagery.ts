/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { OSMLAccount, TSImagery } from "osml-cdk-constructs";

export interface TSImageryStackProps extends StackProps {
  env: Environment;
  account: OSMLAccount;
  vpc: IVpc;
}

export class TSImageryStack extends Stack {
  public resources: TSImagery;

  /**
   * Constructor for the tile server test imagery deployment cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSImageryStack object
   */
  constructor(parent: App, name: string, props: TSImageryStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create required tile server testing resources
    this.resources = new TSImagery(this, "TSImagery", {
      account: props.account,
      vpc: props.vpc
    });
  }
}
