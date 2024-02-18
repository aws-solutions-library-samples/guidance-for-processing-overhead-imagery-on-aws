/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { IRole } from "aws-cdk-lib/aws-iam";
import { OSMLAccount, OSMLVpc, TSDataplane } from "osml-cdk-constructs";

export interface TSDataplaneStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly containerImage: ContainerImage;
  readonly taskRole?: IRole;
}

export class TSDataplaneStack extends Stack {
  public resources: TSDataplane;

  /**
   * Constructor for the tile server dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSDataplaneStack object
   */
  constructor(parent: App, name: string, props: TSDataplaneStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the tile server application dataplane
    this.resources = new TSDataplane(this, "TSDataplane", {
      account: props.account,
      taskRole: props.taskRole,
      osmlVpc: props.osmlVpc,
      containerImage: props.containerImage
    });
  }
}
