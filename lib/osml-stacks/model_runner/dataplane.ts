/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { MRDataplane } from "osml-cdk-constructs/lib/model_runner/mr_dataplane"
import { OSMLAccount } from "osml-cdk-constructs/lib/osml/osml_account"
import { MRTesting } from "osml-cdk-constructs/lib/model_runner/mr_testing"
import { MRMonitoring } from "osml-cdk-constructs/lib/model_runner/mr_monitoring"

export interface MRDataplaneStackProps extends StackProps {
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
 * The stack required to create DDB resources
 */
export class MRDataplaneStack extends Stack {
  public resources: MRDataplane;
  public testingResources: MRTesting;
  public monitoringResources: MRMonitoring;

  /**
   * Constructor for the dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: MRDataplaneStackProps) {
    super(parent, name, {
      terminationProtection: props.account.prodLike,
      ...props
    });

    // create the model runner dataplane
    this.resources = new MRDataplane(this, "MRDataplane", {
      account: props.account,
      enableAutoscaling: props.account.enableAutoscaling
    });

    // if we have enabled testing resources, create the model runner testing resources
    if (props.account.enableTesting) {
      // create required model runner testing resources
      this.testingResources = new MRTesting(this, "MRTesting", {
        account: props.account,
        vpc: this.resources.vpc.vpc,
        imageStatusTopic: this.resources.imageStatusTopic.topic,
        regionStatusTopic: this.resources.imageStatusTopic.topic
      });
    }

    // if we have enabled monitoring dashboard deployment
    if (props.account.enableMonitoring) {
      this.monitoringResources = new MRMonitoring(this, "MRMonitoring", {
        account: props.account,
        imageRequestQueue: this.resources.imageRequestQueue.queue,
        regionRequestQueue: this.resources.regionRequestQueue.queue,
        imageRequestDlQueue: this.resources.imageRequestQueue.dlQueue,
        regionRequestDlQueue: this.resources.regionRequestQueue.dlQueue,
        service: this.resources.fargateService,
        mrDataplaneConfig: this.resources.mrDataplaneConfig,
        model: this.testingResources.mrTestingConfig.SM_AIRCRAFT_MODEL
      });
    }
  }
}
