/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { OSMLAccount, OSMLVpc, DCContainer } from "osml-cdk-constructs";

export interface DCContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
}

export class DCContainerStack extends Stack {
  public resources: DCContainer;

  /**
   * Constructor for the data catalog container cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created DCContainerStack object
   */
  constructor(parent: App, name: string, props: DCContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the STAC catalog ECR container image
    this.resources = new DCContainer(this, "DCContainer", {
      account: props.account,
      osmlVpc: props.osmlVpc
    });
  }
}
