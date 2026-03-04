/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AccessLogFormat,
  AuthorizationType,
  ConnectionType,
  Cors,
  EndpointType,
  GatewayResponse,
  HttpIntegration,
  IdentitySource,
  LogGroupLogDestination,
  RequestAuthorizer,
  ResponseType,
  RestApi,
  VpcLink
} from "aws-cdk-lib/aws-apigateway";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import {
  NetworkLoadBalancer,
  Protocol
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { AlbArnTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";

/**
 * Properties for the LoadBalancerIntegration construct.
 */
export interface LoadBalancerIntegrationProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The name prefix for resources created by this construct. */
  readonly name: string;
  /** The target URL of the backend ALB. */
  readonly targetUrl: string;
  /** The ARN of the backend ALB (required for NLB target group). */
  readonly targetAlbArn: string;
  /** The shared Lambda authorizer function for JWT validation. */
  readonly authorizerFunction: IFunction;
  /** The VPC where the backend ALB resides. */
  readonly vpc: IVpc;
  /** The subnet selection for VPC resources. */
  readonly vpcSubnets: SubnetSelection;
  /** The security group for VPC resources. */
  readonly securityGroup: ISecurityGroup;
  /** Optional list of CORS allowed origins. */
  readonly corsAllowedOrigins?: string[];
}

/**
 * LoadBalancerIntegration creates an API Gateway REST API that proxies requests
 * to an internal Application Load Balancer via a Network Load Balancer.
 *
 * Architecture: API Gateway → HTTP Integration → Internal NLB → Internal ALB → Service
 *
 * This construct is used for ALB-backed services like Tile Server and Geo Agents.
 * It creates:
 * - A Network Load Balancer (NLB) in front of the ALB
 * - A REST API with JWT-based authorization
 * - HTTP integration pointing to the NLB (which API Gateway can reach)
 * - The NLB forwards all traffic to the backend ALB
 *
 * Requirements addressed:
 * - 3.3, 3.4, 3.5: Tile Server API Gateway integration with authorizer
 * - 5.3, 5.4, 5.5: Geo Agents API Gateway integration with authorizer
 */
export class LoadBalancerIntegration extends Construct {
  /** The REST API created by this construct. */
  public readonly restApi: RestApi;
  /** The Network Load Balancer created by this construct. */
  public readonly nlb: NetworkLoadBalancer;
  /** The VPC Link for connecting API Gateway to the NLB. */
  public readonly vpcLink: VpcLink;
  /** The request authorizer for JWT validation. */
  public readonly requestAuthorizer: RequestAuthorizer;
  /** The effective URL for accessing the API. */
  public readonly effectiveUrl: string;

  /**
   * Creates a new LoadBalancerIntegration construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(
    scope: Construct,
    id: string,
    props: LoadBalancerIntegrationProps
  ) {
    super(scope, id);

    // Create Network Load Balancer to bridge API Gateway to internal ALB
    // Note: NLBs don't require security groups - they pass through source IPs
    // The ALB's security group (which allows 10.0.0.0/16) will handle access control
    this.nlb = new NetworkLoadBalancer(this, "NetworkLoadBalancer", {
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      internetFacing: false,
      crossZoneEnabled: true,
      securityGroups: [] // Explicitly set no security groups
    });

    // Create listener on NLB and add ALB as target
    // Following osml-cdk-constructs pattern: use AlbArnTarget for imported ALBs
    const nlbListener = this.nlb.addListener("Listener", {
      port: 80,
      protocol: Protocol.TCP
    });

    nlbListener.addTargets("TargetGroup", {
      targets: [new AlbArnTarget(props.targetAlbArn, 80)],
      port: 80
      // Note: Using default health check settings for ALB target type
      // ALB target groups have specific health check requirements
    });

    // Create VPC Link to allow API Gateway to connect to the internal NLB
    this.vpcLink = new VpcLink(this, "VpcLink", {
      targets: [this.nlb],
      vpcLinkName: `${props.name}-VpcLink`
    });

    // Create request authorizer using the shared authorizer function
    this.requestAuthorizer = new RequestAuthorizer(this, "RequestAuthorizer", {
      authorizerName: `${props.name}-Authorizer`,
      handler: props.authorizerFunction,
      identitySources: [IdentitySource.header("Authorization")],
      resultsCacheTtl: Duration.minutes(0)
    });

    // Use NLB DNS for HTTP integration via VPC Link
    const nlbUrl = `http://${this.nlb.loadBalancerDnsName}`;

    // Configure CORS origins
    const corsOrigins = this.configureCorsOrigins(
      props.account.prodLike,
      props.corsAllowedOrigins
    );

    // Create CloudWatch Log Group for API Gateway access logs
    const accessLogGroup = new LogGroup(this, "AccessLogGroup", {
      logGroupName: `/aws/apigateway/${props.name}-RestApi`,
      retention: props.account.prodLike
        ? RetentionDays.ONE_YEAR
        : RetentionDays.ONE_WEEK,
      removalPolicy: props.account.prodLike
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY
    });

    // Create the REST API with HTTP integration to the NLB
    this.restApi = new RestApi(this, "RestApi", {
      restApiName: `${props.name}-RestApi`,
      description: `API Gateway for ${props.name} with JWT authorization`,
      deployOptions: {
        stageName: "api",
        accessLogDestination: new LogGroupLogDestination(accessLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true
        })
      },
      endpointTypes: [EndpointType.REGIONAL],
      defaultMethodOptions: {
        requestParameters: {
          "method.request.path.proxy": true,
          "method.request.header.Accept": true,
          "method.request.header.Content-Type": true
        },
        authorizer: this.requestAuthorizer,
        authorizationType: AuthorizationType.CUSTOM
      },
      defaultCorsPreflightOptions:
        corsOrigins.length > 0
          ? {
              allowOrigins: corsOrigins,
              allowHeaders: [
                ...Cors.DEFAULT_HEADERS,
                "Authorization",
                "X-Api-Key",
                "X-Requested-With",
                "mcp-session-id",
                "mcp-protocol-version"
              ],
              allowMethods: Cors.ALL_METHODS,
              exposeHeaders: ["Mcp-Session-Id"],
              allowCredentials: corsOrigins !== Cors.ALL_ORIGINS,
              maxAge: Duration.hours(1)
            }
          : undefined
    });

    // Create HTTP integration pointing to the NLB via VPC Link
    // The {proxy} path parameter captures all path segments
    // Set Host header to custom domain so backend constructs URLs correctly
    const httpIntegration = new HttpIntegration(`${nlbUrl}/{proxy}`, {
      httpMethod: "ANY",
      proxy: true,
      options: {
        vpcLink: this.vpcLink,
        connectionType: ConnectionType.VPC_LINK,
        requestParameters: {
          "integration.request.header.Host": "context.domainName",
          "integration.request.path.proxy": "method.request.path.proxy",
          "integration.request.header.Accept": "method.request.header.Accept",
          "integration.request.header.Content-Type":
            "method.request.header.Content-Type",
          "integration.request.header.X-Forwarded-Path":
            "method.request.path.proxy",
          "integration.request.header.X-Forwarded-Host": "context.domainName",
          "integration.request.header.X-Forwarded-Proto": "'https'"
        }
      }
    });

    // Add proxy resource to handle all paths with the HTTP integration
    const proxyResource = this.restApi.root.addProxy({
      anyMethod: false,
      defaultIntegration: httpIntegration
    });

    // Add ANY method to the proxy resource with authorization
    proxyResource.addMethod("ANY", httpIntegration, {
      requestParameters: {
        "method.request.path.proxy": true,
        "method.request.header.Accept": true,
        "method.request.header.Content-Type": true
      },
      authorizer: this.requestAuthorizer,
      authorizationType: AuthorizationType.CUSTOM
    });

    // Add a root method for requests to the base path
    // Note: When CORS is enabled, defaultCorsPreflightOptions adds an OPTIONS method
    // to the root, so we need to add other methods individually to avoid conflicts
    const rootIntegration = new HttpIntegration(nlbUrl, {
      httpMethod: "ANY",
      proxy: true,
      options: {
        vpcLink: this.vpcLink,
        connectionType: ConnectionType.VPC_LINK,
        requestParameters: {
          "integration.request.header.Accept": "method.request.header.Accept",
          "integration.request.header.Content-Type":
            "method.request.header.Content-Type"
        }
      }
    });

    // Add specific HTTP methods to the root resource instead of ANY
    // This avoids conflicts with CORS OPTIONS method
    const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];
    for (const method of httpMethods) {
      this.restApi.root.addMethod(method, rootIntegration, {
        requestParameters: {
          "method.request.header.Accept": true,
          "method.request.header.Content-Type": true
        },
        authorizer: this.requestAuthorizer,
        authorizationType: AuthorizationType.CUSTOM
      });
    }

    // Add Gateway Responses to ensure CORS headers are included in error responses
    if (corsOrigins.length > 0) {
      this.addCorsGatewayResponses(corsOrigins);
    }

    // Add CDK NAG suppressions
    this.addNagSuppressions();

    // Set the effective URL
    this.effectiveUrl = this.restApi.url;
  }

  /**
   * Configures CORS origins based on environment and provided origins.
   *
   * @param isProdLike - Whether this is a production-like environment
   * @param corsAllowedOrigins - Optional list of allowed origins
   * @returns Array of allowed origins
   */
  private configureCorsOrigins(
    isProdLike: boolean,
    corsAllowedOrigins?: string[]
  ): string[] {
    if (!isProdLike) {
      // Development: Always allow all origins for easy development
      return Cors.ALL_ORIGINS;
    }

    if (corsAllowedOrigins && corsAllowedOrigins.length > 0) {
      // Production: Use specified origins
      if (corsAllowedOrigins.includes("*")) {
        return Cors.ALL_ORIGINS;
      }
      return corsAllowedOrigins;
    }

    // Production with no origins specified: No CORS headers (same-origin only)
    return [];
  }

  /**
   * Adds Gateway Responses with CORS headers for error responses.
   *
   * @param corsOrigins - The allowed CORS origins
   */
  private addCorsGatewayResponses(corsOrigins: string[]): void {
    const corsHeaders = {
      "Access-Control-Allow-Origin": `'${
        corsOrigins === Cors.ALL_ORIGINS ? "*" : corsOrigins.join(",")
      }'`,
      "Access-Control-Allow-Headers": `'${[
        ...Cors.DEFAULT_HEADERS,
        "Authorization",
        "X-Api-Key",
        "X-Requested-With"
      ].join(",")}'`,
      "Access-Control-Allow-Methods": "'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'"
    };

    // Add CORS headers to common error responses
    const errorResponseTypes = [
      ResponseType.BAD_REQUEST_BODY,
      ResponseType.BAD_REQUEST_PARAMETERS,
      ResponseType.UNAUTHORIZED,
      ResponseType.ACCESS_DENIED,
      ResponseType.RESOURCE_NOT_FOUND,
      ResponseType.REQUEST_TOO_LARGE,
      ResponseType.THROTTLED,
      ResponseType.DEFAULT_4XX,
      ResponseType.DEFAULT_5XX
    ];

    errorResponseTypes.forEach((responseType, index) => {
      new GatewayResponse(this, `GatewayResponse${index}`, {
        restApi: this.restApi,
        type: responseType,
        responseHeaders: corsHeaders
      });
    });
  }

  /**
   * Adds CDK NAG suppressions for expected warnings.
   *
   * These suppressions document justified deviations from AWS best practices
   * for the API Gateway integration. Each suppression includes a detailed
   * reason explaining why the deviation is acceptable.
   *
   * Requirements addressed:
   * - 7.3: All suppressions include documented justifications
   */
  private addNagSuppressions(): void {
    // Suppress warnings for API Gateway configuration
    // These are expected for a pass-through proxy pattern where validation
    // and business logic are handled by the backend service
    NagSuppressions.addResourceSuppressions(
      this.restApi,
      [
        {
          id: "AwsSolutions-APIG2",
          reason:
            "Request validation is intentionally not configured at API Gateway level. " +
            "This API acts as a pass-through proxy to the backend ALB service (Tile Server/Geo Agents) " +
            "which handles all request validation. Adding validation at API Gateway would duplicate " +
            "logic and potentially reject valid requests that the backend can process."
        },
        {
          id: "AwsSolutions-APIG4",
          reason:
            "Authorization is handled by the Lambda authorizer (JWT validation) for all methods " +
            "except OPTIONS. OPTIONS methods are intentionally unauthenticated to support CORS " +
            "preflight requests as per the CORS specification (browsers send OPTIONS without credentials)."
        },
        {
          id: "AwsSolutions-COG4",
          reason:
            "Using a custom Lambda authorizer for JWT validation against Keycloak (OIDC provider) " +
            "instead of Cognito User Pool authorizer. This is required because the authentication " +
            "is handled by an external Keycloak server, not Amazon Cognito."
        }
      ],
      true
    );

    // Suppress warnings for the request authorizer Lambda permissions
    NagSuppressions.addResourceSuppressions(
      this.requestAuthorizer,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "The RequestAuthorizer itself provides authorization. This suppression is for the " +
            "authorizer resource which doesn't need additional authorization."
        }
      ],
      true
    );
  }
}
