/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import {MRSMRole, MRTaskRole, OSMLAccount} from "osml-cdk-constructs"
import {IRole} from "aws-cdk-lib/aws-iam";

export interface MRRolesStackProps extends StackProps {
  // target deployment environment
  readonly env: Environment;
  // osml account interface
  readonly account: OSMLAccount;

  /**
   * Stack tags that will be applied to all the taggable resources and the stack itself.
   *
   * @default {}
   */
  readonly tags?: {
    [key: string]: string;
  };
}

/**
 * The stack required to OSML Roles
 */
export class MRRolesStack extends Stack {
  public mrTaskRole: IRole;
  public mrSmRole: IRole;

  /**
   * Constructor for the dataplane cdk stack
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

    // create the model runner dataplane
    this.mrTaskRole = new MRTaskRole(this, "MRTaskRole", {
      account: props.account,
      roleName: "MRTaskRole"
    }).role;

    // if we have enabled testing resources, create a SageMaker role for endpoints
    if (props.account.enableTesting) {
      this.mrSmRole = new MRSMRole(this, "MRSMRole", {
        account: props.account,
        roleName: "MRSMRole"
      }).role;
    }

  }
}
