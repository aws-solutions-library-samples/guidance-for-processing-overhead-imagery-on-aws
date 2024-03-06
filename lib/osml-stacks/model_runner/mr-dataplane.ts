/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { IRole } from "aws-cdk-lib/aws-iam";
import { MRDataplane, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface MRDataplaneStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly taskRole: IRole | undefined;
  readonly mrContainerImage: ContainerImage;
}

export class MRDataplaneStack extends Stack {
  public resources: MRDataplane;

  /**
   * Constructor for the model runner dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: MRDataplaneStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the model runner application dataplane
    this.resources = new MRDataplane(this, "MRDataplane", {
      account: props.account,
      taskRole: props.taskRole,
      osmlVpc: props.osmlVpc,
      mrContainerImage: props.mrContainerImage
    });
  }
}
