/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { MRImagery, MRSMRole, OSMLAccount } from "osml-cdk-constructs";

export interface MRImageryStackProps extends StackProps {
  env: Environment;
  account: OSMLAccount;
  vpc: IVpc;
  mrSmRole?: MRSMRole;
}

export class MRImageryStack extends Stack {
  public resources: MRImagery;

  /**
   * Constructor for the model runner test imagery deployment cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: MRImageryStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // create required model runner testing resources
    this.resources = new MRImagery(this, "MRImagery", {
      account: props.account,
      vpc: props.vpc
    });
  }
}
