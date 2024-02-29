/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { OSMLAccount, OSMLCommonPolicy } from "osml-cdk-constructs";

export interface MRCommonPolicyStackProps extends StackProps {
readonly env: Environment;
readonly account: OSMLAccount;
}

export class MRCommonPolicyStack extends Stack {
  public resources: OSMLCommonPolicy;

  /**
   * Constructor for the osml common policy cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created OSMLCommonPolicy object
   */
  constructor(parent: App, name: string, props: MRCommonPolicyStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the model runner ECR container image
    this.resources = new OSMLCommonPolicy(this, "MRCommonPolicy", {
      account: props.account,
      managedPolicyName: "MRCommonPolicy"
    });
  }
}
