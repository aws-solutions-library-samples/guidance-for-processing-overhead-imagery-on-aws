/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { DCIngestContainer, OSMLAccount, OSMLVpc } from "osml-cdk-constructs";

export interface DCIngestContainerStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly osmlVpc: OSMLVpc;
  readonly buildFromSource: boolean | undefined;
}

export class DCIngestContainerStack extends Stack {
  public resources: DCIngestContainer;

  /**
   * Constructor for the data catalog container cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created DCIngestContainer object
   */
  constructor(parent: App, name: string, props: DCIngestContainerStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // Create the STAC ingest container
    this.resources = new DCIngestContainer(this, "DCIngestContainer", {
      account: props.account,
      osmlVpc: props.osmlVpc,
      buildFromSource: props.buildFromSource
    });
  }
}
