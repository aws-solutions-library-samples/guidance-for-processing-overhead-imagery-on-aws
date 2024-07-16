/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import {
  MEHTTPRole,
  MESMRole,
  MRTaskRole,
  OSMLAccount
} from "osml-cdk-constructs";

export interface OSMLStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
}

/**
 * The stack required to OSML Roles
 */
export class OSMLRolesStack extends Stack {
  public mrTaskRole: MRTaskRole;
  public meSMRole: MESMRole;
  public httpEndpointRole: MEHTTPRole;

  /**
   * Constructor for the model runner roles cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns Stack the created MRRolesStack object
   */
  constructor(parent: App, name: string, props: OSMLStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the model runner Fargate task role
    this.mrTaskRole = new MRTaskRole(this, "MRTaskRole", {
      account: props.account,
      roleName: "OSMLMRTaskRole"
    });

    // Create a SageMaker role for model hosted endpoints
    this.meSMRole = new MESMRole(this, "MESMRole", {
      account: props.account,
      roleName: "OSMLSageMakerEndpointRole"
    });

    // Create a new role for the HTTP endpoint
    this.httpEndpointRole = new MEHTTPRole(this, "HTTPEndpointTaskRole", {
      account: props.account,
      roleName: "OSMLHTTPEndpointTaskRole"
    });
  }
}
