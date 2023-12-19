/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MRSync, OSMLAccount } from "osml-cdk-constructs";

export interface MRSyncStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
}

export class MRSyncStack extends Stack {
  public resources: MRSync;

  /**
   * Constructor for the model runner output sync cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRSyncStack object
   */
  constructor(parent: App, name: string, props: MRSyncStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new MRSync(this, "MRSync", {
      account: props.account
    });
  }
}
