/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file OSMLApisStack - Main stack for OSML APIs component.
 *
 * This stack creates:
 * - A shared Lambda authorizer for JWT validation
 * - Conditional API Gateway integrations for Tile Server, Data Intake, and Geo Agents MCP
 * - Stack outputs for cross-stack references
 */

import {
  App,
  CfnOutput,
  Duration,
  Environment,
  RemovalPolicy,
  Stack,
  StackProps
} from "aws-cdk-lib";
import {
  BasePathMapping,
  CfnAccount,
  DomainName,
  EndpointType,
  SecurityPolicy
} from "aws-cdk-lib/aws-apigateway";
import {
  Certificate,
  CertificateValidation,
  ICertificate
} from "aws-cdk-lib/aws-certificatemanager";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  ARecord,
  HostedZone,
  IHostedZone,
  RecordTarget
} from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
import { NagSuppressions } from "cdk-nag";
import { join } from "path";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { LambdaProxyIntegration } from "./constructs/integrations/lambda-integration";
import { LoadBalancerIntegration } from "./constructs/integrations/load-balancer-integration";

/**
 * Properties for the OSMLApisStack.
 */
export interface OSMLApisStackProps extends StackProps {
  /** The AWS environment (account and region). */
  readonly env: Environment;
  /** The deployment configuration. */
  readonly deployment: DeploymentConfig;
  /** The VPC for Lambda authorizer deployment. */
  readonly vpc: IVpc;
  /** The selected subnets for Lambda authorizer. */
  readonly selectedSubnets: SubnetSelection;
  /** The security group for Lambda authorizer. */
  readonly securityGroup: ISecurityGroup;
  /** Skip Lambda bundling (for testing). */
  readonly skipBundling?: boolean;
}

/**
 * Main stack for OSML APIs component.
 *
 * Creates a shared Lambda authorizer and conditionally deploys
 * API Gateway integrations based on configuration.
 */
export class OSMLApisStack extends Stack {
  /** The shared Lambda authorizer function. */
  public readonly authorizerFunction: Function;

  /** The Tile Server API Gateway integration (conditional). */
  public readonly tileServerIntegration?: LoadBalancerIntegration;

  /** The Data Intake API Gateway integration (conditional). */
  public readonly dataIntakeIntegration?: LambdaProxyIntegration;

  /** The Geo Agents MCP API Gateway integration (conditional). */
  public readonly geoAgentsMcpIntegration?: LoadBalancerIntegration;

  /**
   * Creates a new OSMLApisStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: App, id: string, props: OSMLApisStackProps) {
    super(scope, id, {
      terminationProtection: props.deployment.account.prodLike,
      ...props
    });

    const projectName = props.deployment.projectName;
    const dataplaneConfig = props.deployment.dataplaneConfig;

    // Validate dataplaneConfig exists
    if (!dataplaneConfig) {
      throw new Error(
        "dataplaneConfig is required in deployment configuration"
      );
    }

    const authConfig = dataplaneConfig.authConfig;

    // Validate authConfig exists
    if (!authConfig) {
      throw new Error("authConfig is required in dataplaneConfig");
    }

    // Always create the shared Lambda authorizer function
    this.authorizerFunction = this.createAuthorizerFunction(
      props,
      authConfig.authority,
      authConfig.audience
    );

    // Configure required API Gateway account-level CloudWatch Logs role.
    const apiGatewayCloudWatchRole = new Role(
      this,
      "ApiGatewayCloudWatchRole",
      {
        assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
          )
        ]
      }
    );

    const apiGatewayAccount = new CfnAccount(this, "ApiGatewayAccount", {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn
    });

    // Ensure the account-level setting is applied before any REST API stages
    apiGatewayAccount.node.addDependency(apiGatewayCloudWatchRole);

    // Output authorizer ARN (always)
    new CfnOutput(this, "AuthorizerFunctionArn", {
      value: this.authorizerFunction.functionArn,
      description: "Lambda Authorizer Function ARN",
      exportName: `${projectName}-AuthorizerFunctionArn`
    });

    // Conditionally create Tile Server integration
    if (
      dataplaneConfig.TILE_SERVER_URL &&
      dataplaneConfig.TILE_SERVER_ALB_ARN
    ) {
      this.tileServerIntegration = new LoadBalancerIntegration(
        this,
        "TileServerApi",
        {
          account: props.deployment.account,
          name: `${projectName}-TileServer`,
          targetUrl: dataplaneConfig.TILE_SERVER_URL,
          targetAlbArn: dataplaneConfig.TILE_SERVER_ALB_ARN,
          authorizerFunction: this.authorizerFunction,
          vpc: props.vpc,
          vpcSubnets: props.selectedSubnets,
          securityGroup: props.securityGroup,
          corsAllowedOrigins: dataplaneConfig.CORS_ALLOWED_ORIGINS
        }
      );
    }

    // Conditionally create Data Intake integration
    if (dataplaneConfig.DATA_INTAKE_LAMBDA_ARN) {
      this.dataIntakeIntegration = new LambdaProxyIntegration(
        this,
        "DataIntakeApi",
        {
          account: props.deployment.account,
          name: `${projectName}-DataIntake`,
          lambdaArn: dataplaneConfig.DATA_INTAKE_LAMBDA_ARN,
          authorizerFunction: this.authorizerFunction,
          corsAllowedOrigins: dataplaneConfig.CORS_ALLOWED_ORIGINS
        }
      );
    }

    // Conditionally create Geo Agents MCP integration
    if (
      dataplaneConfig.GEO_AGENTS_MCP_URL &&
      dataplaneConfig.GEO_AGENTS_ALB_ARN
    ) {
      this.geoAgentsMcpIntegration = new LoadBalancerIntegration(
        this,
        "GeoAgentsMcpApi",
        {
          account: props.deployment.account,
          name: `${projectName}-GeoAgentsMcp`,
          targetUrl: dataplaneConfig.GEO_AGENTS_MCP_URL,
          targetAlbArn: dataplaneConfig.GEO_AGENTS_ALB_ARN,
          authorizerFunction: this.authorizerFunction,
          vpc: props.vpc,
          vpcSubnets: props.selectedSubnets,
          securityGroup: props.securityGroup,
          corsAllowedOrigins: dataplaneConfig.CORS_ALLOWED_ORIGINS
        }
      );
    }

    // Track effective URLs for each API (custom domain or API Gateway URL)
    let tileServerEffectiveUrl = this.tileServerIntegration?.effectiveUrl;
    let dataIntakeEffectiveUrl = this.dataIntakeIntegration?.effectiveUrl;
    let geoAgentsEffectiveUrl = this.geoAgentsMcpIntegration?.effectiveUrl;

    // Ensure API Gateway account-level CloudWatch role is set before any stage is created.
    if (this.tileServerIntegration) {
      this.tileServerIntegration.restApi.node.addDependency(apiGatewayAccount);
    }
    if (this.dataIntakeIntegration) {
      this.dataIntakeIntegration.restApi.node.addDependency(apiGatewayAccount);
    }
    if (this.geoAgentsMcpIntegration) {
      this.geoAgentsMcpIntegration.restApi.node.addDependency(
        apiGatewayAccount
      );
    }

    // Create custom domain names if hosted zone configuration is provided
    const hostedZoneId = dataplaneConfig.DOMAIN_HOSTED_ZONE_ID;
    const hostedZoneDomainName = dataplaneConfig.DOMAIN_HOSTED_ZONE_NAME;
    const providedCertificateArn = dataplaneConfig.DOMAIN_CERTIFICATE_ARN;

    if (hostedZoneId && hostedZoneDomainName) {
      // Look up the hosted zone
      const hostedZone = HostedZone.fromHostedZoneAttributes(
        this,
        "HostedZone",
        {
          hostedZoneId: hostedZoneId,
          zoneName: hostedZoneDomainName
        }
      );

      // Resolve certificate: use provided ARN or create new wildcard certificate with DNS validation
      let certificate: ICertificate;
      if (providedCertificateArn) {
        // Use the provided certificate
        certificate = Certificate.fromCertificateArn(
          this,
          "ImportedCertificate",
          providedCertificateArn
        );
      } else {
        // Create a wildcard certificate for all API subdomains
        const newCertificate = new Certificate(this, "ApiCertificate", {
          domainName: `*.${hostedZoneDomainName}`,
          validation: CertificateValidation.fromDns(hostedZone)
        });

        // Apply removal policy based on environment
        newCertificate.applyRemovalPolicy(
          props.deployment.account.prodLike
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY
        );

        certificate = newCertificate;
      }

      // Create custom domain for Tile Server API
      if (this.tileServerIntegration) {
        const tileServerDomainName = `tile-server.${hostedZoneDomainName}`;
        this.createCustomDomain(
          "TileServer",
          tileServerDomainName,
          certificate,
          this.tileServerIntegration.restApi,
          hostedZone,
          props.deployment.account.prodLike
        );
        tileServerEffectiveUrl = `https://${tileServerDomainName}/`;
      }

      // Create custom domain for Data Intake API
      if (this.dataIntakeIntegration) {
        const dataIntakeDomainName = `data-catalog.${hostedZoneDomainName}`;
        this.createCustomDomain(
          "DataIntake",
          dataIntakeDomainName,
          certificate,
          this.dataIntakeIntegration.restApi,
          hostedZone,
          props.deployment.account.prodLike
        );
        dataIntakeEffectiveUrl = `https://${dataIntakeDomainName}/`;
      }

      // Create custom domain for Geo Agents API
      if (this.geoAgentsMcpIntegration) {
        const geoAgentsDomainName = `geo-agent-mcp.${hostedZoneDomainName}`;
        this.createCustomDomain(
          "GeoAgents",
          geoAgentsDomainName,
          certificate,
          this.geoAgentsMcpIntegration.restApi,
          hostedZone,
          props.deployment.account.prodLike
        );
        geoAgentsEffectiveUrl = `https://${geoAgentsDomainName}/`;
      }
    }

    // Output API URLs
    if (tileServerEffectiveUrl) {
      new CfnOutput(this, "TileServerApiUrl", {
        value: tileServerEffectiveUrl,
        description: "Tile Server API URL",
        exportName: `${projectName}-TileServerApiUrl`
      });
    }

    if (dataIntakeEffectiveUrl) {
      new CfnOutput(this, "DataIntakeApiUrl", {
        value: dataIntakeEffectiveUrl,
        description: "Data Intake API URL",
        exportName: `${projectName}-DataIntakeApiUrl`
      });
    }

    if (geoAgentsEffectiveUrl) {
      new CfnOutput(this, "GeoAgentsMcpApiUrl", {
        value: geoAgentsEffectiveUrl,
        description: "Geo Agents MCP API URL",
        exportName: `${projectName}-GeoAgentsMcpApiUrl`
      });
    }

    // Add stack-level NAG suppressions
    this.addStackNagSuppressions();
  }

  /**
   * Creates a custom domain name for an API Gateway with Route53 A record.
   *
   * @param prefix - Prefix for resource naming
   * @param domainName - The custom domain name (e.g., "tile-server.example.com")
   * @param certificate - The ACM certificate for TLS
   * @param restApi - The REST API to map to the domain
   * @param hostedZone - The Route53 hosted zone for DNS records
   * @param prodLike - Whether this is a production-like environment
   * @returns The created DomainName resource
   */
  private createCustomDomain(
    prefix: string,
    domainName: string,
    certificate: ICertificate,
    restApi: import("aws-cdk-lib/aws-apigateway").RestApi,
    hostedZone: IHostedZone,
    prodLike: boolean
  ): DomainName {
    // Determine removal policy based on environment
    const removalPolicy = prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;

    // Create the custom domain name
    const domain = new DomainName(this, `${prefix}DomainName`, {
      domainName: domainName,
      certificate: certificate,
      endpointType: EndpointType.REGIONAL,
      securityPolicy: SecurityPolicy.TLS_1_2
    });

    // Ensure the domain is deleted before the certificate on stack teardown
    domain.node.addDependency(certificate);

    // Apply removal policy for non-prod environments
    domain.applyRemovalPolicy(removalPolicy);

    // Map the domain to the API Gateway stage
    const basePathMapping = new BasePathMapping(
      this,
      `${prefix}BasePathMapping`,
      {
        domainName: domain,
        restApi: restApi,
        stage: restApi.deploymentStage
      }
    );
    basePathMapping.applyRemovalPolicy(removalPolicy);

    // Create A record pointing to the API Gateway domain
    const aRecord = new ARecord(this, `${prefix}ARecord`, {
      zone: hostedZone,
      recordName: domainName,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(domain))
    });
    aRecord.applyRemovalPolicy(removalPolicy);

    return domain;
  }

  /**
   * Creates the Lambda authorizer function for JWT validation.
   *
   * @param props - The stack properties
   * @param authority - The OIDC authority URL
   * @param audience - The expected JWT audience
   * @returns The Lambda function
   */
  private createAuthorizerFunction(
    props: OSMLApisStackProps,
    authority: string,
    audience: string
  ): Function {
    const projectName = props.deployment.projectName;

    // Create IAM role for the Lambda authorizer
    const authorizerRole = new Role(this, "AuthorizerRole", {
      roleName: `${projectName}-AuthorizerRole`,
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      description: "IAM role for OSML APIs Lambda authorizer"
    });

    // Add basic Lambda execution permissions
    authorizerRole.addManagedPolicy(
      ManagedPolicy.fromManagedPolicyArn(
        this,
        "LambdaBasicExecution",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // Add VPC access permissions for Lambda
    authorizerRole.addManagedPolicy(
      ManagedPolicy.fromManagedPolicyArn(
        this,
        "LambdaVPCAccess",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
      )
    );

    // Create CloudWatch Log Group for the Lambda function
    const logGroup = new LogGroup(this, "AuthorizerLogGroup", {
      logGroupName: `/aws/lambda/${projectName}-AuthorizerFunction`,
      retention: props.deployment.account.prodLike
        ? RetentionDays.ONE_YEAR
        : RetentionDays.ONE_WEEK,
      removalPolicy: props.deployment.account.prodLike
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY
    });

    // Determine the Lambda code - skip bundling for tests to avoid pip install overhead
    const lambdaCode = props.skipBundling
      ? Code.fromInline(`
# Placeholder code for testing - actual code is bundled during deployment
def lambda_handler(event, context):
    return {"principalId": "user", "policyDocument": {"Version": "2012-10-17", "Statement": []}}
`)
      : Code.fromAsset(join(__dirname, "../lambda/authorizer"), {
          bundling: {
            image: Runtime.PYTHON_3_13.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output"
            ]
          }
        });

    // Create the Lambda function
    const authorizerFunction = new Function(this, "AuthorizerFunction", {
      functionName: `${projectName}-AuthorizerFunction`,
      description: "JWT authorizer for OSML APIs",
      runtime: Runtime.PYTHON_3_13,
      handler: "lambda_function.lambda_handler",
      code: lambdaCode,
      role: authorizerRole,
      vpc: props.vpc,
      vpcSubnets: props.selectedSubnets,
      securityGroups: [props.securityGroup],
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        AUTHORITY: authority,
        AUDIENCE: audience
      },
      logGroup: logGroup
    });

    // Add CDK NAG suppressions for the authorizer function
    this.addAuthorizerNagSuppressions(authorizerRole, authorizerFunction);

    return authorizerFunction;
  }

  /**
   * Adds CDK NAG suppressions for the authorizer Lambda function.
   *
   * @param role - The IAM role for the authorizer
   * @param _fn - The Lambda function (unused, kept for API compatibility)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  private addAuthorizerNagSuppressions(role: Role, _fn: Function): void {
    // Suppress warnings for AWS managed policies
    NagSuppressions.addResourceSuppressions(
      role,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "Using AWS managed policies for Lambda basic execution and VPC access. " +
            "AWSLambdaBasicExecutionRole provides minimal CloudWatch Logs permissions (logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents). " +
            "AWSLambdaVPCAccessExecutionRole provides minimal ENI permissions required for VPC-attached Lambda functions. " +
            "These are standard, AWS-recommended policies for Lambda functions in VPC.",
          appliesTo: [
            "Policy::arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
            "Policy::arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
          ]
        }
      ],
      true
    );
  }

  /**
   * Adds stack-level CDK NAG suppressions.
   *
   * These suppressions apply to resources created by CDK constructs that
   * generate warnings but are configured correctly for this use case.
   */
  private addStackNagSuppressions(): void {
    // Suppress warnings for API Gateway CloudWatch role
    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "API Gateway CloudWatch role uses AWS managed policy AmazonAPIGatewayPushToCloudWatchLogs " +
            "which is the standard policy for API Gateway logging. This role is created automatically by CDK.",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
          ]
        }
      ],
      true
    );
  }
}
