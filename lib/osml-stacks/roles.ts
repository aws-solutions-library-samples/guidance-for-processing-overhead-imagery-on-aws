/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MESMRole } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";

export interface OSMLStackProps extends StackProps {
  readonly env: Environment;
}

/**
 * The stack required to OSML Roles
 */
export class OSMLRolesStack extends Stack {
  public smRole: MESMRole;

  /**
   * Constructor for the model runner roles cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns Stack the created MRRolesStack object
   */
  constructor(parent: App, name: string, props: OSMLStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create a SageMaker role for model hosted endpoints
    this.smRole = new MESMRole(this, "MESMRole", {
      account: appConfig.account,
      roleName: `${appConfig.projectName}SageMakerEndpointRole`
    });
  }
}

/**
 * Deploys the roles stack for the OversightML environment within the specified AWS CDK application.
 *
 * @returns An instance of OSMLRolesStack, representing the deployed roles stack within the AWS CDK application.
 */
export function deployRoles(): OSMLRolesStack {
  return new OSMLRolesStack(appConfig.app, `${appConfig.projectName}-Roles`, {
    env: {
      account: appConfig.account.id,
      region: appConfig.account.region
    },
    description:
      "OSML Roles, Guidance for Processing Overhead Imagery on AWS (SO9240)"
  });
}
