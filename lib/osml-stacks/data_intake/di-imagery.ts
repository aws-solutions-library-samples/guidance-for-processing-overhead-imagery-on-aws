/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { DIImagery, OSMLAccount } from "osml-cdk-constructs";

export interface DIImageryStackProps extends StackProps {
  env: Environment;
  account: OSMLAccount;
  vpc: IVpc;
}

export class DIImageryStack extends Stack {
  public resources: DIImagery;

  /**
   * Constructor for the model runner test imagery deployment cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRImageryStack object
   */
  constructor(parent: App, name: string, props: DIImageryStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new DIImagery(this, "DIImagery", {
      account: props.account,
      vpc: props.vpc
    });
  }
}
