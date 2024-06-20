/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  OSMLAccount,
  OSMLVpc,
  TSTestRunner,
  TSTestRunnerContainer
} from "osml-cdk-constructs";

export interface TSTestRunnerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly lambdaRuntime: Runtime;
  readonly buildFromSource: boolean;
  readonly tsEndpoint: string;
  readonly tsTestImageBucket: string;
}

export class TSTestRunnerStack extends Stack {
  public containerResource: TSTestRunnerContainer;
  public runnerResource: TSTestRunner;

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

    // Create the tile server test runner container
    this.containerResource = new TSTestRunnerContainer(
      this,
      "TSTestRunnerContainer",
      {
        account: props.account,
        osmlVpc: props.osmlVpc,
        lambdaRuntime: props.lambdaRuntime,
        tsEndpoint: props.tsEndpoint,
        tsTestImageBucket: props.tsTestImageBucket,
        buildFromSource: props.buildFromSource,
        config: {
          TS_TEST_CONTAINER: "awsosml/osml-tile-server-test:latest",
          TS_TEST_BUILD_PATH: "lib/osml-tile-server-test",
          TS_TEST_BUILD_TARGET: "osml_tile_server_test",
          TS_TEST_REPOSITORY: "tile-server-test-container"
        }
      }
    );

    // Create the tile server test runner
    this.runnerResource = new TSTestRunner(this, "TSTestRunner", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      dockerImageCode: this.containerResource.dockerImageCode
    });

    this.runnerResource.node.addDependency(this.containerResource);
  }
}
