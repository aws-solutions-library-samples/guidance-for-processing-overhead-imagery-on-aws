/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { OSMLAccount, OSMLVpc, TSContainer } from "osml-cdk-constructs";

export interface MRAppContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly lambdaRuntime: Runtime;
  readonly buildFromSource: boolean;
}

export class TSContainerStack extends Stack {
  public resources: TSContainer;

  /**
   * Constructor for the tile server container cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSContainerStack object
   */
  constructor(parent: App, name: string, props: MRAppContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the tile server ECR container image
    this.resources = new TSContainer(this, "TSContainer", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      lambdaRuntime: props.lambdaRuntime,
      buildFromSource: props.buildFromSource
    });
  }
}
