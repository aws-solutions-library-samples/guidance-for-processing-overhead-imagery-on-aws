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
  EndpointType,
  IdentitySource,
  LambdaIntegration,
  RequestAuthorizer,
  RestApi
} from "aws-cdk-lib/aws-apigateway";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Topic } from "aws-cdk-lib/aws-sns";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
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

// --------- move to osml-cdk-constructs -----------------------

export class ModelRunnerApiConfig extends BaseConfig {
  public MODEL_RUNNER_IMAGE_REQUEST_QUEUE_ARN: string;
  public MODEL_RUNNER_STATUS_TOPIC_ARN: string;
  public SECURITY_GROUP_ID?: string;

  constructor(config: ConfigType = {}) {
    super({
      MODEL_RUNNER_IMAGE_REQUEST_QUEUE_ARN: "",
      MODEL_RUNNER_STATUS_TOPIC_ARN: "",
      ...config
    });
  }
}

export interface ModelRunnerApiDataplaneProps {
  account: OSMLAccount;
  osmlVpc: OSMLVpc;
  config?: ModelRunnerApiConfig;
  auth: OSMLAuth;
}

export class ModelRunnerApiDataplane extends Construct {
  public config: ModelRunnerApiConfig;
  public removalPolicy: RemovalPolicy;
  public api: RestApi;
  public jobsTable: Table;
  public authorizer: OSMLAuthorizer;

  constructor(
    scope: Construct,
    id: string,
    props: ModelRunnerApiDataplaneProps
  ) {
    super(scope, id);

    this.setup(props);

    // Lambda authorizer
    this.authorizer = new OSMLAuthorizer(this, "ModelRunnerApiAuthorizer", {
      auth: props.auth,
      name: "ModelRunnerApi",
      osmlVpc: props.osmlVpc,
      securityGroup: this.config.SECURITY_GROUP_ID
    });

    // DynamoDB table
    this.jobsTable = new Table(this, "MRApiJobsTable", {
      partitionKey: { name: "job_id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: this.removalPolicy,
      timeToLiveAttribute: "ttl"
    });

    this.jobsTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: { name: "status", type: AttributeType.STRING },
      sortKey: { name: "created_at", type: AttributeType.STRING }
    });

    // Image request SQS
    const modelRunnerQueue = Queue.fromQueueArn(
      this,
      "ModelRunnerQueue",
      this.config.MODEL_RUNNER_IMAGE_REQUEST_QUEUE_ARN
    );

    // Status SNS
    const modelRunnerTopic = Topic.fromTopicArn(
      this,
      "ModelRunnerTopic",
      this.config.MODEL_RUNNER_STATUS_TOPIC_ARN
    );
    // Roles
    const apiRole = new Role(this, "ApiRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com")
    });

    const statusMonitorRole = new Role(this, "ApiStatusMonitorRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com")
    });

    // API dependencies layer
    const pythonDependenciesLayer = new LayerVersion(
      this,
      "MRApiPythonDependencies",
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
        description: "FastAPI and dependencies for Model Runner API"
      }
    );

    // API Lambda
    const apiLambdaCode = `
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union, Literal
from datetime import datetime
import boto3
import json
import logging

# Schema definitions
class Output(BaseModel):
    type: str
    bucket: Optional[str] = None
    prefix: Optional[str] = None
    stream: Optional[str] = None
    batchSize: Optional[int] = None

class ImageProcessor(BaseModel):
    name: str
    type: str

class NMSAlgorithm(BaseModel):
    algorithm_type: Literal["NMS"]
    iouThreshold: float

class SoftNMSAlgorithm(BaseModel):
    algorithm_type: Literal["SOFT_NMS"]
    iouThreshold: float
    skipBoxThreshold: float
    sigma: float

class PostProcessingStep(BaseModel):
    step: Literal["FEATURE_DISTILLATION"]
    algorithm: Union[NMSAlgorithm, SoftNMSAlgorithm]

class ImageProcessingJobCreate(BaseModel):
    jobName: str
    jobId: str
    imageUrls: List[str]
    outputs: List[Output]
    imageProcessor: ImageProcessor
    imageProcessorTileSize: int
    imageProcessorTileOverlap: int
    imageProcessorTileFormat: str
    imageProcessorTileCompression: str
    postProcessing: List[PostProcessingStep]
    regionOfInterest: Optional[Dict[str, Any]] = None

class ImageProcessingJobStatus(BaseModel):
    job_id: str
    job_name: str
    status: str
    updated_at: str
    image_status: str
    image_id: str
    processing_duration: str
    output_bucket: str

class ImageProcessingJobList(BaseModel):
    jobs: List[ImageProcessingJobStatus]

# Initialize AWS clients
sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('${this.jobsTable.tableName}')
queue_url = '${modelRunnerQueue.queueUrl}'

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

@app.post("/jobs", status_code=status.HTTP_201_CREATED)
async def create_image_processing_job(job_request: ImageProcessingJobCreate):
    timestamp = datetime.utcnow().isoformat()
    
    # Validate post-processing configuration
    if job_request.postProcessing:
        for pp in job_request.postProcessing:
            if pp.algorithm == "NMS":
                if not isinstance(pp, NMSPostProcessing):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Invalid NMS configuration"
                    )
            elif pp.algorithm == "SOFT_NMS":
                if not isinstance(pp, SoftNMSPostProcessing):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Invalid SOFT_NMS configuration"
                    )
    
    # Prepare message for ModelRunner
    message = job_request.dict()
    
    # Create initial DDB entry
    try:
        # Find S3 output configuration
        output_bucket = next((output.bucket for output in job_request.outputs 
                            if output.type == "S3" and output.bucket), "")
        
        initial_job_status = {
            "job_id": job_request.jobId,
            "job_name": job_request.jobName,
            "status": "REQUESTED",
            "updated_at": timestamp,
            "image_status": "REQUESTED",
            "image_id": "",
            "processing_duration": "0",
            "output_bucket": output_bucket
        }
        
        table.put_item(Item=initial_job_status)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job record: {str(e)}"
        )
    
    # Send to SQS
    try:
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit job: {str(e)}"
        )
    
    return {"message": "Image request submitted successfully"}

@app.get("/jobs", response_model=ImageProcessingJobList)
async def list_image_processing_jobs():
    try:
        response = table.scan()
        jobs = response.get('Items', [])
        
        # Convert DynamoDB items to ImageProcessingJobStatus objects
        parsed_jobs = [ImageProcessingJobStatus(**job) for job in jobs]
        
        return ImageProcessingJobList(jobs=parsed_jobs)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to list jobs: {str(e)}")

@app.get("/jobs/{job_id}", response_model=ImageProcessingJobStatus)
async def get_image_processing_job(job_id: str):
    try:
        response = table.get_item(Key={'job_id': str(job_id)})
        job = response.get('Item')
        
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
        return ImageProcessingJobStatus(**job)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get job: {str(e)}")

# Create handler for Lambda
handler = Mangum(app)
`;

    const apiFunction = new Function(this, "MRApi", {
      runtime: Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: Code.fromInline(apiLambdaCode),
      layers: [pythonDependenciesLayer],
      environment: {
        DDB_TABLE: this.jobsTable.tableName,
        IMAGE_REQUEST_QUEUE_URL: modelRunnerQueue.queueUrl
      },
      timeout: Duration.seconds(60),
      memorySize: 1024,
      role: apiRole
    });

    // Status monitor Lambda
    const statusMonitorLambdaCode = `
import json
import boto3
from datetime import datetime
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('${this.jobsTable.tableName}')

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    for record in event['Records']:
        try:
            logger.info(f"Processing record: {json.dumps(record)}")
            
            # Get values from MessageAttributes
            message_attributes = record['Sns']['MessageAttributes']
            
            # Required attributes
            job_id = message_attributes['job_id']['Value']
            status = message_attributes['status']['Value']
            
            # Build update expression dynamically
            update_parts = []
            expression_attribute_names = {}
            expression_attribute_values = {}
            
            # Always update status and updated_at
            update_parts.extend(['#status = :status', 'updated_at = :updated_at'])
            expression_attribute_names['#status'] = 'status'
            expression_attribute_values.update({
                ':status': status,
                ':updated_at': datetime.utcnow().isoformat()
            })
            
            # Optional attributes - only add if present
            if 'image_id' in message_attributes:
                update_parts.append('image_id = :image_id')
                expression_attribute_values[':image_id'] = message_attributes['image_id']['Value']
            
            if 'image_status' in message_attributes:
                update_parts.append('image_status = :image_status')
                expression_attribute_values[':image_status'] = message_attributes['image_status']['Value']
            
            if 'processing_duration' in message_attributes:
                update_parts.append('processing_duration = :processing_duration')
                expression_attribute_values[':processing_duration'] = message_attributes['processing_duration']['Value']
            
            if 'result_url' in message_attributes:
                update_parts.append('result_url = :result_url')
                expression_attribute_values[':result_url'] = message_attributes['result_url']['Value']
            
            # Construct the final update expression
            update_expression = 'SET ' + ', '.join(update_parts)
            
            # Update DDB
            update_params = {
                'Key': {'job_id': job_id},
                'UpdateExpression': update_expression,
                'ExpressionAttributeNames': expression_attribute_names,
                'ExpressionAttributeValues': expression_attribute_values
            }
            
            logger.info(f"Updating DDB with params: {json.dumps(update_params)}")
            
            table.update_item(**update_params)
            
            logger.info(f"Successfully updated item for job_id: {job_id} with status: {status}")
            
        except KeyError as e:
            logger.error(f"Missing expected key in message attributes: {str(e)}")
            logger.error(f"Available attributes: {json.dumps(record['Sns'].get('MessageAttributes', {}))}")
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            logger.error(f"Record: {json.dumps(record)}")
    
    return {
        'statusCode': 200,
        'body': json.dumps('Processed {} messages'.format(len(event['Records'])))
    }
`;
    const statusMonitorFunction = new Function(this, "MRApiStatusMonitor", {
      runtime: Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: Code.fromInline(statusMonitorLambdaCode),
      environment: {
        DDB_TABLE: this.jobsTable.tableName
      },
      timeout: Duration.seconds(60),
      memorySize: 1024,
      role: statusMonitorRole
    });

    // Subscribe to SNS topic
    modelRunnerTopic.addSubscription(
      new LambdaSubscription(statusMonitorFunction)
    );

    // API Gateway
    this.api = new RestApi(this, "MR-RestApi", {
      restApiName: "MR-RestApi",
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

    const apiIntegration = new LambdaIntegration(apiFunction);

    const apiAuthorizer = new RequestAuthorizer(this, "ApiAuthorizer", {
      handler: this.authorizer.authorizerFunction,
      identitySources: [IdentitySource.header("Authorization")],
      resultsCacheTtl: Duration.seconds(0)
    });

    const jobs = this.api.root.addResource("jobs");
    jobs.addMethod("POST", apiIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: AuthorizationType.CUSTOM
    });
    jobs.addMethod("GET", apiIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: AuthorizationType.CUSTOM
    });

    const job = jobs.addResource("{jobId}");
    job.addMethod("GET", apiIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: AuthorizationType.CUSTOM
    });

    // Permissions
    this.jobsTable.grantReadWriteData(apiFunction);
    this.jobsTable.grantReadWriteData(statusMonitorFunction);
    modelRunnerQueue.grantSendMessages(apiFunction);

    // CloudWatch Logs permissions
    const cloudWatchPolicy = new PolicyStatement({
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      resources: ["arn:aws:logs:*:*:*"]
    });

    apiFunction.addToRolePolicy(cloudWatchPolicy);
    statusMonitorFunction.addToRolePolicy(cloudWatchPolicy);
  }

  private setup(props: ModelRunnerApiDataplaneProps): void {
    this.config = props.config ?? new ModelRunnerApiConfig();
    this.removalPolicy = props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;
  }
}

// --------- end move to osml-cdk-constructs -------------------

export interface ModelRunnerApiStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
}

export class ModelRunnerApiStack extends Stack {
  public resources: ModelRunnerApiDataplane;

  constructor(parent: App, name: string, props: ModelRunnerApiStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    if (!appConfig.auth) {
      throw new Error("Auth configuration is required for ModelRunnerApiStack");
    }

    this.resources = new ModelRunnerApiDataplane(
      this,
      "ModelRunnerApiDataplane",
      {
        account: appConfig.account,
        osmlVpc: props.osmlVpc,
        config: appConfig.modelRunnerApi?.config
          ? new ModelRunnerApiConfig(appConfig.modelRunnerApi.config)
          : undefined,
        auth: appConfig.auth
      }
    );
  }
}

export function deployModelRunnerApi(
  vpcStack: OSMLVpcStack
): ModelRunnerApiStack {
  return new ModelRunnerApiStack(
    appConfig.app,
    `${appConfig.projectName}-ModelRunnerApi`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      description: "Model Runner API Stack",
      osmlVpc: vpcStack.resources
    }
  );
}
