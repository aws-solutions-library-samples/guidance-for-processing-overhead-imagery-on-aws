/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import {
  OSMLVpc,
  TSTestRunner,
  TSTestRunnerContainer
} from "osml-cdk-constructs";

import { AppConfig } from "../../../../bin/app_config";

export interface TSTestRunnerStackProps extends StackProps {
  readonly env: Environment;
  readonly config: AppConfig;
  readonly osmlVpc: OSMLVpc;
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
      terminationProtection: props.config.account.prodLike,
      ...props
    });

    // Create the tile server test runner container
    this.containerResource = new TSTestRunnerContainer(
      this,
      "TSTestRunnerContainer",
      {
        account: props.config.account,
        osmlVpc: props.osmlVpc,
        tsEndpoint: props.tsEndpoint,
        tsTestImageBucket: props.tsTestImageBucket,
        buildFromSource: props.config.tileServer.buildFromSource,
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
      account: props.config.account,
      osmlVpc: props.osmlVpc,
      dockerImageCode: this.containerResource.dockerImageCode
    });

    this.runnerResource.node.addDependency(this.containerResource);
  }
}
