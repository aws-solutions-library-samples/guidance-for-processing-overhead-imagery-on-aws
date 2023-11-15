/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MRSMRole, MRTaskRole, OSMLAccount } from "osml-cdk-constructs";

export interface MRRolesStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
}

/**
 * The stack required to OSML Roles
 */
export class MRRolesStack extends Stack {
  public mrTaskRole: MRTaskRole;
  public mrSmRole: MRSMRole;

  /**
   * Constructor for the model runner roles cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns Stack the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: MRRolesStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // create the model runner operation role
    this.mrTaskRole = new MRTaskRole(this, "MRTaskRole", {
      account: props.account,
      roleName: "MRTaskRole"
    });

    // create a SageMaker role for endpoints
    this.mrSmRole = new MRSMRole(this, "MRSMRole", {
      account: props.account,
      roleName: "MRSMRole"
    });
  }
}
