/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { OSMLAccount, OSMLVpc, DCDataplane } from "osml-cdk-constructs";
import { DockerImageCode } from "aws-cdk-lib/aws-lambda";

export interface DCDataplaneStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly dockerImageCode: DockerImageCode;
}

export class DCDataplaneStack extends Stack {
  public resources: DCDataplane;

  /**
   * Constructor for the data catalog dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created DCDataplaneStack object
   */
  constructor(parent: App, name: string, props: DCDataplaneStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the data catalog application
    this.resources = new DCDataplane(this, "DCDataplane", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      dockerImageCode: props.dockerImageCode
    });
  }
}
