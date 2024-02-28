/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { OSMLAccount, OSMLVpc, TSTestRunner } from "osml-cdk-constructs";

export interface TSTestRunnerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly buildFromSource: boolean;
  readonly tsEndpoint: string;
  readonly tsTestImageBucket: string;
  readonly tsTestImageKey: string;
}

export class TSTestRunnerStack extends Stack {
  public resources: TSTestRunner;

  /**
   * Constructor for the tile server test runner cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSTestRunnerStack object
   */
  constructor(parent: App, name: string, props: TSTestRunnerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the tile server test runner
    this.resources = new TSTestRunner(this, "TSTestRunner", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      tsEndpoint: props.tsEndpoint,
      tsTestImageBucket: props.tsTestImageBucket,
      tsTestImageKey: props.tsTestImageKey,
      buildFromSource: props.buildFromSource
    });
  }
}
