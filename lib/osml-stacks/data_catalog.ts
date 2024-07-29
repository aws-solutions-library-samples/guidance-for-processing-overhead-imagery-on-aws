/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { DCDataplane, DCDataplaneConfig, OSMLVpc } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

export interface DataCatalogStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly ingestTopic?: ITopic | undefined;
}

export class DataCatalogStack extends Stack {
  public resources: DCDataplane;

  /**
   * Constructor for the data catalog dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created DCDataplaneStack object
   */
  constructor(parent: App, name: string, props: DataCatalogStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create the data catalog application
    this.resources = new DCDataplane(this, "DCDataplane", {
      account: appConfig.account,
      osmlVpc: props.osmlVpc,
      ingestTopic: props.ingestTopic,
      config: appConfig.dataCatalog?.config
        ? new DCDataplaneConfig(appConfig.dataCatalog.config)
        : undefined,
      auth: appConfig.auth ? appConfig.auth : undefined
    });
  }
}

/**
 * Deploys all the necessary infrastructure for the data Catalog service. This includes the base lambda container and the
 * dataplane to support its operation.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by the tile server.
 * @param ingestTopic Provides an ingested topic to subscribe the stac catalog to.
 */
export function deployDataCatalog(
  vpcStack: OSMLVpcStack,
  ingestTopic: ITopic | undefined = undefined
): DataCatalogStack {
  return new DataCatalogStack(
    appConfig.app,
    `${appConfig.projectName}-DataCatalog`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      osmlVpc: vpcStack.resources,
      ingestTopic: ingestTopic,
      description:
        "OSML Data Catalog, Guidance for Processing Overhead Imagery on AWS (SO9240)"
    }
  );
}
