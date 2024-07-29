/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { OSMLVpc, OSMLVpcConfig } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLRolesStack } from "./roles";

export interface OSMLVpcStackProps extends StackProps {
  readonly env: Environment;
}

export class OSMLVpcStack extends Stack {
  public resources: OSMLVpc;

  /**
   * Constructor for the model runner vpc stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created OSMLVpcStack object
   */
  constructor(parent: App, name: string, props: OSMLVpcStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new OSMLVpc(this, "OSMLVpc", {
      account: appConfig.account,
      config: appConfig.vpc?.config
        ? new OSMLVpcConfig(appConfig.vpc.config)
        : undefined
    });
  }
}

/**
 * Deploys the Virtual Private Cloud (VPC) stack for the OversightML applications to operate within.

 *
 * @param osmlRolesStack An optional instance of `OSMLRolesStack`.
 * If provided, the deployed VPC stack will be configured to have a dependency on it,
 * ensuring the necessary roles and permissions are in place before setting up the VPC.
 * @returns An instance of OSMLVpcStack representing the networking infrastructure for OSML.
 */
export function deployVpc(
  osmlRolesStack: OSMLRolesStack | undefined = undefined
): OSMLVpcStack {
  // Deploy the Virtual Private Cloud (VPC) resources for OversightML
  const vpcStack = new OSMLVpcStack(
    appConfig.app,
    `${appConfig.projectName}-Vpc`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      description:
        "VPC, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  // If a role stack was provided make it an explicit dependency
  if (osmlRolesStack) {
    vpcStack.addDependency(osmlRolesStack);
  }

  return vpcStack;
}
