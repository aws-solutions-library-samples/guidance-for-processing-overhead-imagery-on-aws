/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { DIContainer, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface DIContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly buildFromSource: boolean;
}

export class DIContainerStack extends Stack {
  public resources: DIContainer;
  /**
   * Constructor for the tile server test runner cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSTestRunnerStack object
   */
  constructor(parent: App, name: string, props: DIContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    this.resources = new DIContainer(this, "DIContainer", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      buildFromSource: props.buildFromSource
    });
  }
}
