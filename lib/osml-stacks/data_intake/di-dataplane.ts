/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { DIDataplane, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface DIDataplaneStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly dockerImageCode: DockerImageCode;
}

export class DIDataplaneStack extends Stack {
  public resources: DIDataplane;
  /**
   * Constructor for the Data Intake dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   */
  constructor(parent: App, name: string, props: DIDataplaneStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    this.resources = new DIDataplane(this, "DIDataplane", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      dockerImageCode: props.dockerImageCode
    });
  }
}
