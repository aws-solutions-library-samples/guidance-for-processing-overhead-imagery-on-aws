/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MRAppContainer, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface MRAppContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
}

export class MRAppContainerStack extends Stack {
  public resources: MRAppContainer;

  /**
   * Constructor for the model runner container cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MREcrStack object
   */
  constructor(parent: App, name: string, props: MRAppContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the model runner ECR container image
    this.resources = new MRAppContainer(this, "MRAppRepo", {
      account: props.account,
      osmlVpc: props.osmlVpc
    });
  }
}
