/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

import { App, Aspects } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { NetworkConfig } from "../lib/constructs/network/network";
import { OSMLNetworkStack } from "../lib/network-stack";

describe("OSMLNetworkStack", () => {
  let app: App;
  let stack: OSMLNetworkStack;
  let template: Template;

  // Create stack once before all tests
  beforeAll(() => {
    app = new App();
    stack = new OSMLNetworkStack(app, "TestStack", {
      deployment: {
        projectName: "OSML-VPC",
        account: {
          id: "123456789012",
          region: "us-west-2",
          prodLike: false,
          isAdc: false
        },
        networkConfig: new NetworkConfig({
          MAX_AZS: 2
        })
      }
    });
    template = Template.fromStack(stack);
  });

  describe("stack synthesis", () => {
    it("should synthesize a stack with VPC resource", () => {
      template.resourceCountIs("AWS::EC2::VPC", 1);
    });

    it("should create public and private subnets", () => {
      // With maxAzs=2, we should have 2 public + 2 private = 4 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });

    it("should create internet gateway", () => {
      template.resourceCountIs("AWS::EC2::InternetGateway", 1);
    });

    it("should not create security groups (components create their own)", () => {
      template.resourceCountIs("AWS::EC2::SecurityGroup", 0);
    });

    it("should create VPC flow logs", () => {
      template.resourceCountIs("AWS::EC2::FlowLog", 1);
      template.resourceCountIs("AWS::Logs::LogGroup", 1);
    });
  });

  describe("CloudFormation outputs", () => {
    it("should define VpcId output", () => {
      template.hasOutput("VpcId", {
        Description: "VPC ID",
        Export: {
          Name: "TestStack-VpcId"
        }
      });
    });

    it("should define VpcArn output", () => {
      template.hasOutput("VpcArn", {
        Description: "VPC ARN",
        Export: {
          Name: "TestStack-VpcArn"
        }
      });
    });

    it("should define PublicSubnetIds output", () => {
      template.hasOutput("PublicSubnetIds", {
        Description: "Comma-separated list of public subnet IDs",
        Export: {
          Name: "TestStack-PublicSubnetIds"
        }
      });
    });

    it("should define PrivateSubnetIds output", () => {
      template.hasOutput("PrivateSubnetIds", {
        Description: "Comma-separated list of private subnet IDs",
        Export: {
          Name: "TestStack-PrivateSubnetIds"
        }
      });
    });

    it("should define AvailabilityZones output", () => {
      template.hasOutput("AvailabilityZones", {
        Description: "Comma-separated list of availability zones",
        Export: {
          Name: "TestStack-AvailabilityZones"
        }
      });
    });
  });

  describe("subnet configuration", () => {
    it("should create subnets based on maxAzs configuration", () => {
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });
  });

  describe("tags", () => {
    it("should add Project and Component tags", () => {
      template.hasResourceProperties("AWS::EC2::VPC", {
        Tags: [
          { Key: "Component", Value: "Network" },
          { Key: "Name", Value: "osml-vpc" },
          { Key: "Project", Value: "OSML" }
        ]
      });
    });
  });
});

describe("OSMLNetworkStack with prodLike=true", () => {
  let app: App;
  let template: Template;

  beforeAll(() => {
    app = new App();
    const stack = new OSMLNetworkStack(app, "ProdTestStack", {
      deployment: {
        projectName: "OSML-VPC",
        account: {
          id: "123456789012",
          region: "us-west-2",
          prodLike: true,
          isAdc: false
        },
        networkConfig: new NetworkConfig({
          MAX_AZS: 2
        })
      }
    });
    template = Template.fromStack(stack);
  });

  it("should add Environment tag for production-like deployments", () => {
    template.hasResourceProperties("AWS::EC2::VPC", {
      Tags: [
        { Key: "Component", Value: "Network" },
        { Key: "Environment", Value: "Production" },
        { Key: "Name", Value: "osml-vpc" },
        { Key: "Project", Value: "OSML" }
      ]
    });
  });
});

describe("cdk-nag Compliance Checks - OSMLNetworkStack", () => {
  let app: App;
  let stack: OSMLNetworkStack;

  beforeAll(() => {
    app = new App();
    stack = new OSMLNetworkStack(app, "NagTestStack", {
      deployment: {
        projectName: "OSML-VPC",
        account: {
          id: "123456789012",
          region: "us-west-2",
          prodLike: false,
          isAdc: false
        },
        networkConfig: new NetworkConfig({
          MAX_AZS: 2
        })
      }
    });

    // Add the cdk-nag AwsSolutions Pack with verbose logging
    Aspects.of(stack).add(
      new AwsSolutionsChecks({
        verbose: true
      })
    );
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(errors).toHaveLength(0);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(warnings).toHaveLength(0);
  });
});
