import {
  App,
  Duration,
  Environment,
  RemovalPolicy,
  Stack,
  StackProps
} from "aws-cdk-lib";
import {
  AuthorizationType,
  Cors,
  CorsOptions,
  EndpointType,
  IdentitySource,
  LambdaIntegration,
  MethodOptions,
  RequestAuthorizer,
  RestApi
} from "aws-cdk-lib/aws-apigateway";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket, CfnBucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import {
  BaseConfig,
  ConfigType,
  OSMLAccount,
  OSMLAuth,
  OSMLAuthorizer,
  OSMLVpc
} from "osml-cdk-constructs";
import * as path from "path";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

// Configuration class
export class S3ApiConfig extends BaseConfig {
  /**
   * Whether to restrict S3 access to specific buckets.
   * @default false
   */
  public RESTRICT_BUCKET_ACCESS: boolean;

  /**
   * List of specific bucket ARNs to allow access to.
   * Only used if RESTRICT_BUCKET_ACCESS is true.
   * @default []
   */
  public ALLOWED_BUCKET_ARNS?: string[];

  /**
   * The security group ID to use for the Lambda function.
   * @default undefined
   */
  public SECURITY_GROUP_ID?: string;

  constructor(config: ConfigType = {}) {
    super({
      RESTRICT_BUCKET_ACCESS: false,
      ALLOWED_BUCKET_ARNS: [],
      ...config
    });
  }
}

// Dataplane props interface
export interface S3ApiDataplaneProps {
  account: OSMLAccount;
  osmlVpc: OSMLVpc;
  config?: S3ApiConfig;
  auth: OSMLAuth;
}

// Dataplane class
export class S3ApiDataplane extends Construct {
  public config: S3ApiConfig;
  public removalPolicy: RemovalPolicy;
  public api: RestApi;
  public authorizer: OSMLAuthorizer;

  constructor(scope: Construct, id: string, props: S3ApiDataplaneProps) {
    super(scope, id);

    this.setup(props);

    // Create the authorizer
    this.authorizer = new OSMLAuthorizer(this, "S3ApiAuthorizer", {
      auth: props.auth,
      name: "S3Api",
      osmlVpc: props.osmlVpc,
      securityGroup: this.config.SECURITY_GROUP_ID
    });

    // Create layer with dependencies
    const pythonDependenciesLayer = new LayerVersion(
      this,
      "S3ApiPythonDependencies",
      {
        code: Code.fromAsset(path.join(__dirname, "layer"), {
          bundling: {
            image: Runtime.PYTHON_3_11.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install fastapi==0.104.1 mangum==0.17.0 pydantic==2.4.2 -t /asset-output/python && " +
                "cd /asset-output/python && find . -type d -name '__pycache__' -exec rm -rf {} + && " +
                "find . -type f -name '*.pyc' -delete"
            ],
            user: "root"
          }
        }),
        compatibleRuntimes: [Runtime.PYTHON_3_11],
        description: "FastAPI and dependencies for S3 API"
      }
    );

    // Lambda function code
    // Available endpoints:
    // GET /s3 - List all buckets
    // GET /s3/{bucket} - List objects in bucket
    // GET /s3/{bucket}/{key} - Get presigned URL for object
    const lambdaCode = `
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import boto3
import logging
from botocore.config import Config
from urllib.parse import unquote
import os

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Schema definitions
class S3Bucket(BaseModel):
    name: str
    creationDate: str

class S3Object(BaseModel):
    key: str
    size: int
    lastModified: str

class BucketResponse(BaseModel):
    bucket: str
    objects: List[S3Object]

class BucketsResponse(BaseModel):
    buckets: List[S3Bucket]

class PresignedUrlResponse(BaseModel):
    presignedUrl: str

# Get allowed buckets from environment variable
ALLOWED_BUCKET_ARNS = os.environ.get('ALLOWED_BUCKET_ARNS', '').split(',')
ALLOWED_BUCKET_NAMES = [arn.split(':')[-1] for arn in ALLOWED_BUCKET_ARNS if arn]
RESTRICT_BUCKET_ACCESS = os.environ.get('RESTRICT_BUCKET_ACCESS', 'false').lower() == 'true'

# Initialize AWS clients with proper configuration for SigV4
s3_client = boto3.client('s3', config=Config(signature_version='s3v4'))

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.get("/s3", response_model=BucketsResponse)
async def list_buckets():
    """List all available S3 buckets."""
    try:
        logger.info("Listing buckets")
        logger.info(f"RESTRICT_BUCKET_ACCESS: {RESTRICT_BUCKET_ACCESS}")
        logger.info(f"ALLOWED_BUCKET_NAMES: {ALLOWED_BUCKET_NAMES}")
        
        response = s3_client.list_buckets()
        buckets = []
        
        for bucket in response.get('Buckets', []):
            # Filter buckets if restriction is enabled
            if RESTRICT_BUCKET_ACCESS:
                if bucket['Name'] in ALLOWED_BUCKET_NAMES:
                    buckets.append(S3Bucket(
                        name=bucket['Name'],
                        creationDate=bucket['CreationDate'].isoformat()
                    ))
            else:
                buckets.append(S3Bucket(
                    name=bucket['Name'],
                    creationDate=bucket['CreationDate'].isoformat()
                ))
        
        logger.info(f"Found {len(buckets)} accessible buckets")
        return BucketsResponse(buckets=buckets)
    except Exception as e:
        logger.error(f"Failed to list buckets: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list buckets: {str(e)}"
        )

@app.get("/s3/{bucket}", response_model=BucketResponse)
async def list_objects(bucket: str):
    """List objects in a specific bucket."""
    try:
        logger.info(f"Listing objects in bucket: {bucket}")
        
        # Check if bucket access is allowed
        if RESTRICT_BUCKET_ACCESS and bucket not in ALLOWED_BUCKET_NAMES:
            logger.warning(f"Access denied to bucket: {bucket}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access to bucket {bucket} is not allowed"
            )
        
        response = s3_client.list_objects_v2(Bucket=bucket)
        objects = [
            S3Object(
                key=obj['Key'],
                size=obj['Size'],
                lastModified=obj['LastModified'].isoformat()
            ) for obj in response.get('Contents', [])
        ]
        
        logger.info(f"Found {len(objects)} objects in bucket {bucket}")
        return BucketResponse(bucket=bucket, objects=objects)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list objects in bucket {bucket}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list objects: {str(e)}"
        )

@app.get("/s3/{bucket}/{key:path}", response_model=PresignedUrlResponse)
async def get_presigned_url(bucket: str, key: str):
    """Generate a presigned URL for an object in S3."""
    try:
        # Check if bucket access is allowed
        if RESTRICT_BUCKET_ACCESS and bucket not in ALLOWED_BUCKET_NAMES:
            logger.warning(f"Access denied to bucket: {bucket}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access to bucket {bucket} is not allowed"
            )
        
        # Decode the URL-encoded key
        decoded_key = unquote(key)
        logger.info(f"Generating presigned URL for bucket: {bucket}, key: {decoded_key}")
        
        # Verify the object exists before generating the URL
        try:
            s3_client.head_object(Bucket=bucket, Key=decoded_key)
        except s3_client.exceptions.ClientError as e:
            if e.response['Error']['Code'] == '404':
                logger.error(f"Object not found: {bucket}/{decoded_key}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Object not found: {decoded_key}"
                )
            raise

        # Generate presigned URL (expiration: 5 minutes)
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket,
                'Key': decoded_key
            },
            ExpiresIn=300
        )
        
        logger.info(f"Successfully generated presigned URL for {bucket}/{decoded_key}")
        return PresignedUrlResponse(presignedUrl=url)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {bucket}/{key}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {str(e)}"
        )

# Create handler for Lambda
handler = Mangum(app)
`;

    // Create the Lambda function
    const s3ApiLambda = new Function(this, "S3ApiLambda", {
      runtime: Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: Code.fromInline(lambdaCode),
      layers: [pythonDependenciesLayer],
      environment: {
        RESTRICT_BUCKET_ACCESS: this.config.RESTRICT_BUCKET_ACCESS.toString(),
        ALLOWED_BUCKET_ARNS: (this.config.ALLOWED_BUCKET_ARNS || []).join(",")
      },
      timeout: Duration.seconds(30),
      vpc: props.osmlVpc.vpc,
      vpcSubnets: props.osmlVpc.selectedSubnets,
      securityGroups: this.config.SECURITY_GROUP_ID
        ? [
            SecurityGroup.fromSecurityGroupId(
              this,
              "S3ApiLambdaSecurityGroup",
              this.config.SECURITY_GROUP_ID
            )
          ]
        : undefined
    });

    // Add S3 permissions
    if (
      this.config.RESTRICT_BUCKET_ACCESS &&
      this.config.ALLOWED_BUCKET_ARNS?.length
    ) {
      s3ApiLambda.addToRolePolicy(
        new PolicyStatement({
          actions: ["s3:ListBucket", "s3:GetObject"],
          resources: [
            ...this.config.ALLOWED_BUCKET_ARNS,
            ...this.config.ALLOWED_BUCKET_ARNS.map((arn) => `${arn}/*`)
          ]
        })
      );
      // Add separate statement for ListAllMyBuckets
      s3ApiLambda.addToRolePolicy(
        new PolicyStatement({
          actions: ["s3:ListAllMyBuckets"],
          resources: ["*"] // ListAllMyBuckets requires resource "*"
        })
      );
    } else {
      s3ApiLambda.addToRolePolicy(
        new PolicyStatement({
          actions: ["s3:ListBucket", "s3:ListAllMyBuckets", "s3:GetObject"],
          resources: ["*"]
        })
      );
    }

    // Create API Gateway
    this.api = new RestApi(this, "S3Api", {
      restApiName: "S3-RestApi",
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token"
        ]
      },
      endpointConfiguration: {
        types: [EndpointType.REGIONAL]
      }
    });

    // Create API Gateway Authorizer
    const apiAuthorizer = new RequestAuthorizer(this, "ApiAuthorizer", {
      handler: this.authorizer.authorizerFunction,
      identitySources: [IdentitySource.header("Authorization")],
      resultsCacheTtl: Duration.seconds(0)
    });

    // Define CORS settings
    const corsSettings: CorsOptions = {
      allowOrigins: Cors.ALL_ORIGINS,
      allowMethods: Cors.ALL_METHODS,
      allowHeaders: [
        "Content-Type",
        "X-Amz-Date",
        "Authorization",
        "X-Api-Key",
        "X-Amz-Security-Token"
      ]
    };

    // Define common method options
    const commonMethodOptions: MethodOptions = {
      authorizer: apiAuthorizer,
      authorizationType: AuthorizationType.CUSTOM,
      requestParameters: {
        "method.request.path.key": true // This enables passing the encoded path parameter
      }
    };

    // Create API resources and methods
    const s3Resource = this.api.root.addResource("s3", {
      defaultCorsPreflightOptions: corsSettings
    });

    s3Resource.addMethod("GET", new LambdaIntegration(s3ApiLambda), {
      ...commonMethodOptions
    });

    const bucketResource = s3Resource.addResource("{bucket}", {
      defaultCorsPreflightOptions: corsSettings
    });

    bucketResource.addMethod("GET", new LambdaIntegration(s3ApiLambda), {
      ...commonMethodOptions
    });

    const objectResource = bucketResource.addResource("{key}", {
      defaultCorsPreflightOptions: corsSettings
    });

    objectResource.addMethod(
      "GET",
      new LambdaIntegration(s3ApiLambda, {
        requestParameters: {
          "integration.request.path.key": "method.request.path.key"
        }
      }),
      {
        ...commonMethodOptions
      }
    );
  }

  private setup(props: S3ApiDataplaneProps): void {
    this.config = props.config ?? new S3ApiConfig();
    this.removalPolicy = props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;
  }
}

// Stack class
export interface S3ListingAPIStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
}

export class S3ApiStack extends Stack {
  public resources: S3ApiDataplane;

  constructor(parent: App, name: string, props: S3ListingAPIStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    if (!appConfig.auth) {
      throw new Error("Auth configuration is required for S3ApiStack");
    }

    this.resources = new S3ApiDataplane(this, "S3ApiDataplane", {
      account: appConfig.account,
      osmlVpc: props.osmlVpc,
      auth: appConfig.auth,
      config: appConfig.s3Api?.config
        ? new S3ApiConfig(appConfig.s3Api.config)
        : undefined
    });
  }
}

// Deploy function
export function deployS3Api(vpcStack: OSMLVpcStack): S3ApiStack {
  return new S3ApiStack(appConfig.app, `${appConfig.projectName}-S3Api`, {
    env: {
      account: appConfig.account.id,
      region: appConfig.account.region
    },
    description: "S3 API Stack",
    osmlVpc: vpcStack.resources
  });
}
