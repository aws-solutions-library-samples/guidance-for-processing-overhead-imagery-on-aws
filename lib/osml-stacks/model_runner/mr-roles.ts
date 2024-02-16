/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MESMRole, MRTaskRole, OSMLAccount } from "osml-cdk-constructs";

export interface MRRolesStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
}

/**
 * The stack required to OSML Roles
 */
export class MRRolesStack extends Stack {
  public mrTaskRole: MRTaskRole;
  public meSMRole: MESMRole;

  /**
   * Constructor for the model runner roles cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns Stack the created MRRolesStack object
   */
  constructor(parent: App, name: string, props: MRRolesStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the model runner operation role
    this.mrTaskRole = new MRTaskRole(this, "MRTaskRole", {
      account: props.account,
      roleName: "MRTaskRole"
    });

    // Create a SageMaker role for endpoints
    this.meSMRole = new MESMRole(this, "MESMRole", {
      account: props.account,
      roleName: "MESMRole"
    });
  }
}
