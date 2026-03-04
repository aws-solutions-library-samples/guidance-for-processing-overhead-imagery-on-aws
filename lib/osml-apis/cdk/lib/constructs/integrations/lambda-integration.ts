/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AccessLogFormat,
  AuthorizationType,
  Cors,
  EndpointType,
  GatewayResponse,
  IdentitySource,
  LambdaIntegration,
  LogGroupLogDestination,
  RequestAuthorizer,
  ResponseType,
  RestApi
} from "aws-cdk-lib/aws-apigateway";
import { Function, IFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";

/**
 * Properties for the LambdaProxyIntegration construct.
 */
export interface LambdaProxyIntegrationProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The name prefix for resources created by this construct. */
  readonly name: string;
  /** The ARN of the target Lambda function to invoke. */
  readonly lambdaArn: string;
  /** The shared Lambda authorizer function for JWT validation. */
  readonly authorizerFunction: IFunction;
  /** Optional list of CORS allowed origins. */
  readonly corsAllowedOrigins?: string[];
}

/**
 * LambdaProxyIntegration creates an API Gateway REST API that proxies requests
 * to a Lambda function using AWS_PROXY integration.
 *
 * This construct is used for Lambda-backed services like Data Intake STAC API.
 * It creates a REST API with JWT-based authorization that forwards all requests
 * to the target Lambda function while preserving path, headers, and request body.
 *
 * Requirements addressed:
 * - 4.3: AWS_PROXY Lambda integration for STAC API
 * - 4.4: Shared Lambda authorizer for request authentication
 * - 4.5: Proxy all requests preserving path, headers, and body
 * - 4.6: Grant API Gateway permission to invoke the Lambda function
 */
export class LambdaProxyIntegration extends Construct {
  /** The REST API created by this construct. */
  public readonly restApi: RestApi;
  /** The request authorizer for JWT validation. */
  public readonly requestAuthorizer: RequestAuthorizer;
  /** The imported target Lambda function. */
  public readonly targetFunction: IFunction;
  /** The effective URL for accessing the API. */
  public readonly effectiveUrl: string;

  /**
   * Creates a new LambdaProxyIntegration construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(
    scope: Construct,
    id: string,
    props: LambdaProxyIntegrationProps
  ) {
    super(scope, id);

    // Import the target Lambda function by ARN
    this.targetFunction = Function.fromFunctionArn(
      this,
      "TargetFunction",
      props.lambdaArn
    );

    // Create request authorizer using the shared authorizer function
    this.requestAuthorizer = new RequestAuthorizer(this, "RequestAuthorizer", {
      authorizerName: `${props.name}-Authorizer`,
      handler: props.authorizerFunction,
      identitySources: [IdentitySource.header("Authorization")],
      resultsCacheTtl: Duration.minutes(0)
    });

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

    // Create Lambda integration (AWS_PROXY mode)
    // This preserves the full request context including path, headers, and body
    const lambdaIntegration = new LambdaIntegration(this.targetFunction, {
      proxy: true,
      allowTestInvoke: true
    });

    // Create the REST API with Lambda proxy integration
    this.restApi = new RestApi(this, "RestApi", {
      restApiName: `${props.name}-RestApi`,
      description: `API Gateway for ${props.name} with JWT authorization and Lambda proxy`,
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
                "X-Requested-With"
              ],
              allowMethods: Cors.ALL_METHODS,
              allowCredentials: corsOrigins !== Cors.ALL_ORIGINS,
              maxAge: Duration.hours(1)
            }
          : undefined
    });

    // Add proxy resource to handle all paths with the Lambda integration
    const proxyResource = this.restApi.root.addProxy({
      anyMethod: false,
      defaultIntegration: lambdaIntegration
    });

    // Add ANY method to the proxy resource with authorization
    proxyResource.addMethod("ANY", lambdaIntegration, {
      requestParameters: {
        "method.request.path.proxy": true,
        "method.request.header.Accept": true,
        "method.request.header.Content-Type": true
      },
      authorizer: this.requestAuthorizer,
      authorizationType: AuthorizationType.CUSTOM
    });

    // Add methods for requests to the base path
    // Note: When CORS is enabled, defaultCorsPreflightOptions adds an OPTIONS method
    // to the root, so we need to add other methods individually to avoid conflicts
    const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];
    for (const method of httpMethods) {
      this.restApi.root.addMethod(method, lambdaIntegration, {
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
   * for the API Gateway Lambda integration. Each suppression includes a detailed
   * reason explaining why the deviation is acceptable.
   *
   * Requirements addressed:
   * - 7.3: All suppressions include documented justifications
   */
  private addNagSuppressions(): void {
    // Suppress warnings for API Gateway configuration
    // These are expected for a Lambda proxy pattern where validation
    // and business logic are handled by the Lambda function
    NagSuppressions.addResourceSuppressions(
      this.restApi,
      [
        {
          id: "AwsSolutions-APIG2",
          reason:
            "Request validation is intentionally not configured at API Gateway level. " +
            "This API uses AWS_PROXY integration where the Lambda function (Data Intake STAC API) " +
            "handles all request validation. Adding validation at API Gateway would duplicate " +
            "logic and potentially reject valid STAC API requests."
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
