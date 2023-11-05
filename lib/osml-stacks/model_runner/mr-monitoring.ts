/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MRDataplane, MRMonitoring, OSMLAccount } from "osml-cdk-constructs";

export interface MRMonitoringStackProps extends StackProps {
  readonly env: Environment;
  readonly account: OSMLAccount;
  readonly mrDataplane: MRDataplane;
  readonly targetModel: string;
}

export class MRMonitoringStack extends Stack {
  public resources: MRMonitoring;
  /**
   * Constructor for the monitoring dashboard cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: MRMonitoringStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });
    this.resources = new MRMonitoring(this, "MRMonitoring", {
      account: props.account,
      imageRequestQueue: props.mrDataplane.imageRequestQueue.queue,
      regionRequestQueue: props.mrDataplane.regionRequestQueue.queue,
      imageRequestDlQueue: props.mrDataplane.imageRequestQueue.dlQueue,
      regionRequestDlQueue: props.mrDataplane.regionRequestQueue.dlQueue,
      service: props.mrDataplane.fargateService,
      mrDataplaneConfig: props.mrDataplane.mrDataplaneConfig,
      model: props.targetModel
    });
  }
}
