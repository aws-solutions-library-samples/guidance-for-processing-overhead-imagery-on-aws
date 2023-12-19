/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MEContainer, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface MRModelContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
}

export class MRModelContainerStack extends Stack {
  public resources: MEContainer;

  /**
   * Constructor for the model container ECR assets
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRModelContainerStack object
   */
  constructor(parent: App, name: string, props: MRModelContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new MEContainer(this, "MEContainer", {
      account: props.account,
      osmlVpc: props.osmlVpc
    });
  }
}
