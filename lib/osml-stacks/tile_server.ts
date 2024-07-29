/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IRole } from "aws-cdk-lib/aws-iam";
import { OSMLVpc, TSDataplane, TSDataplaneConfig } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

export interface TileServerStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly taskRole?: IRole;
}

export class TileServerStack extends Stack {
  public resources: TSDataplane;

  /**
   * Constructor for the tile server dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TSDataplaneStack object
   */
  constructor(parent: App, name: string, props: TileServerStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create the tile server application dataplane
    this.resources = new TSDataplane(this, "TSDataplane", {
      account: appConfig.account,
      taskRole: props.taskRole,
      osmlVpc: props.osmlVpc,
      config: appConfig.tileServer?.config
        ? new TSDataplaneConfig(appConfig.tileServer.config)
        : undefined,
      auth: appConfig.auth ? appConfig.auth : undefined
    });
  }
}

/**
 * Initializes and deploys the infrastructure required for operating a tile server.
 * This involves setting up a container for the tile server and configuring the necessary
 * data plane resources for operation. It uses AWS CDK for infrastructure as code deployment,
 * ensuring that all resources are appropriately configured and interlinked within the specified
 * AWS environment and account.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by tile server.
 */
export function deployTileServer(
  vpcStack: OSMLVpcStack
): TileServerStack {
  return new TileServerStack(
    appConfig.app,
    `${appConfig.projectName}-TileServer`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      description:
        "OSML Tile Server, Guidance for Processing Overhead Imagery on AWS (SO9240)",
      osmlVpc: vpcStack.resources
    }
  );
}
