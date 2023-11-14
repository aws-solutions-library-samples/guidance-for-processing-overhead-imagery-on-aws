/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import {
  MREndpoints,
  MRModelEndpointsConfig,
  MRSMRole,
  OSMLAccount,
  OSMLVpc
} from "osml-cdk-constructs";

export interface MRModelEndpointsStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly mrSmRole?: MRSMRole;
  readonly modelContainerUri: string;
  readonly modelContainerImage: ContainerImage;
}

export class MRModelEndpointsStack extends Stack {
  public resources: MREndpoints;

  /**
   * Constructor for the model runner testing cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRModelEndpointsStack object
   */
  constructor(parent: App, name: string, props: MRModelEndpointsStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // create required model runner testing resources
    this.resources = new MREndpoints(this, "MRModelEndpoints", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      smRole: props.mrSmRole?.role,
      modelContainerUri: props.modelContainerUri,
      modelContainerImage: props.modelContainerImage
    });
  }
}