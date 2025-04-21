/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import {
  App,
  CustomResource,
  Duration,
  Environment,
  RemovalPolicy,
  Size,
  Stack,
  StackProps
} from "aws-cdk-lib";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import {
  Certificate,
  CertificateValidation
} from "aws-cdk-lib/aws-certificatemanager";
import {
  AmazonLinux2023ImageSsmParameter,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  LaunchTemplate,
  Peer,
  Port,
  SecurityGroup,
  UserData
} from "aws-cdk-lib/aws-ec2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket, BucketEncryption, IBucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import {
  BaseConfig,
  ConfigType,
  OSMLAccount,
  OSMLAuth,
  OSMLVpc,
  RegionalConfig
} from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

// --------- move to osml-cdk-constructs -----------------------
export class UIDataplaneConfig extends BaseConfig {
  /**
   * Whether to build web app from source.
   * @default "false"
   */
  public BUILD_FROM_SOURCE: boolean;

  /**
   * The local path to the UI app artifacts.
   * @default ""
   */
  public ARTIFACT_LOCAL_PATH?: string | undefined;

  /**
   * The owner of the github repo the artifacts are published in.
   * @default "awslabs"
   */
  public ARTIFACT_GITHUB_OWNER?: string | undefined;

  /**
   * The github repo the artifacts are published in.
   * @default "osml-web-app"
   */
  public ARTIFACT_GITHUB_REPO?: string | undefined;

  /**
   * The existing Route53 hosted zone to use for the Web App.
   * If not provided, SSL will not be set up.
   */
  public HOSTED_ZONE?: string | undefined;

  /**
   * The domain name to use for the Web App.
   * If not provided it will use the WEB_APP_HOSTED_ZONE value.
   */
  public DOMAIN_NAME?: string | undefined;

  /**
   * The security group ID to use for the Web App ALB.
   * @default undefined
   */
  public ALB_SECURITY_GROUP_ID?: string | undefined;

  /**
   * The security group ID to use for the Web App EC2 instance.
   * @default undefined
   */
  public EC2_SECURITY_GROUP_ID?: string | undefined;

  public TILE_SERVER_URL: string;
  public STAC_CATALOG_URL: string;
  public S3_API_URL: string;
  public MODEL_RUNNER_API_URL: string;
  public AUTH_SUCCESS_URL: string;
  public AUTH_CLIENT_ID: string;
  public AUTH_SECRET: string;

  constructor(config: ConfigType = {}) {
    super({
      BUILD_FROM_SOURCE: false,
      ARTIFACT_LOCAL_PATH: "./lib/osml-web-app/build.zip",
      ARTIFACT_GITHUB_OWNER: "awslabs",
      ARTIFACT_GITHUB_REPO: "osml-web-app",
      ...config
    });
  }
}

export interface UIDataplaneProps {
  /**
   * The OSML deployment account.
   * @type {OSMLAccount}
   */
  account: OSMLAccount;

  /**
   * The OSML VPC (Virtual Private Cloud) configuration for the Dataplane.
   * @type {OSMLVpc}
   */
  osmlVpc: OSMLVpc;

  /**
   * Custom configuration for the TSDataplane Construct (optional).
   * @type {TSDataplaneConfig | undefined}
   */
  config?: UIDataplaneConfig;

  /**
   * The configuration for the authentication.
   *
   * @type {OSMLAuth}
   */
  auth?: OSMLAuth;
}

export class UIDataplane extends Construct {
  /**
   * The configuration for the UIDataplane.
   */
  public config: UIDataplaneConfig;

  /**
   * The removal policy for resources created by this construct.
   */
  public removalPolicy: RemovalPolicy;

  /**
   * The security group for the UI ALB.
   */
  public albSecurityGroup?: ISecurityGroup;

  /**
   * The security group for the UI EC2.
   */
  public ec2SecurityGroup?: ISecurityGroup;

  /**
   * The application load balancer to be used for the FargateService.
   */
  public alb: ApplicationLoadBalancer;

  /**
   * The regional S3 endpoint.
   */
  public regionalS3Endpoint: string;

  constructor(scope: Construct, id: string, props: UIDataplaneProps) {
    super(scope, id);

    // Setup class from base properties
    this.setup(props);

    // Create artifact bucket
    const artifactBucket = new Bucket(this, "ArtifactBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: this.removalPolicy,
      autoDeleteObjects: true // Change as needed
    });

    // Deployment method depends on buildFromSource flag
    if (this.config.BUILD_FROM_SOURCE) {
      if (!this.config.ARTIFACT_LOCAL_PATH) {
        throw new Error(
          "localArtifactPath must be provided when buildFromSource is true"
        );
      }

      // Deploy from local artifacts
      new BucketDeployment(this, "DeployLocalArtifact", {
        sources: [Source.asset(this.config.ARTIFACT_LOCAL_PATH)],
        destinationBucket: artifactBucket,
        destinationKeyPrefix: "current",
        memoryLimit: 8192,
        ephemeralStorageSize: Size.gibibytes(10)
      });
    } else {
      if (
        !this.config.ARTIFACT_GITHUB_OWNER ||
        !this.config.ARTIFACT_GITHUB_REPO
      ) {
        throw new Error(
          "githubOwner and githubRepo must be provided when buildFromSource is false"
        );
      }

      // Create custom resource to fetch and deploy from GitHub
      new CustomResource(this, "GithubArtifactDeployment", {
        serviceToken:
          this.createGithubArtifactFunction(artifactBucket).functionArn,
        properties: {
          GithubOwner: this.config.ARTIFACT_GITHUB_OWNER,
          GithubRepo: this.config.ARTIFACT_GITHUB_REPO,
          Timestamp: Date.now() // Force update on each deployment
        }
      });
    }

    // ALB
    this.alb = new ApplicationLoadBalancer(this, "WebAppAlb", {
      vpc: props.osmlVpc.vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup
    });

    let listener;

    if (this.config.HOSTED_ZONE) {
      // Set up SSL and Route 53 if domain name is provided
      const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
        domainName: this.config.HOSTED_ZONE
      });

      // Use WEB_APP_DOMAIN_NAME if provided, otherwise fall back to hosted zone
      const domainName = this.config.DOMAIN_NAME ?? this.config.HOSTED_ZONE;

      const certificate = new Certificate(this, "Certificate", {
        domainName: domainName,
        validation: CertificateValidation.fromDns(hostedZone)
      });

      listener = this.alb.addListener("HttpsListener", {
        port: 443,
        certificates: [certificate],
        protocol: ApplicationProtocol.HTTPS
      });

      // Route 53 Alias Record
      new ARecord(this, "AliasRecord", {
        zone: hostedZone,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(this.alb)),
        recordName: domainName
      });
    } else {
      // Set up HTTP listener if no domain name is provided
      listener = this.alb.addListener("HttpListener", {
        port: 80,
        protocol: ApplicationProtocol.HTTP
      });
    }

    // User data script
    const userData = UserData.forLinux();
    userData.addCommands(
      "exec > >(tee /var/log/user-data-script.log) 2>&1",
      "echo 'Starting user data script execution'",

      // Update system
      "echo 'Updating system packages'",
      "dnf update -q -y",

      // Install basic utilities
      "echo 'Installing basic utilities'",
      "dnf install -q -y unzip aws-cli nginx",

      // Install Node.js 20
      "echo 'Installing Node.js 20'",
      "dnf install -q -y nodejs20",
      "echo 'Setting up Node.js path'",
      "export PATH=$PATH:/usr/bin",
      "which node",
      "which npm",
      "which pm2",

      // Verify installations
      "echo 'Verifying installations:'",
      "nginx -v",
      "node -v",
      "npm -v",

      // Configure nginx
      "echo 'Configuring Nginx'",
      this.getNginxConfig(),

      // Setup application directory
      "echo 'Setting up application directory'",
      "mkdir -p /var/www/html",
      "chmod -R 755 /var/www/html",
      "cd /var/www/html",

      // List S3 bucket contents for debugging
      "echo 'Listing S3 bucket contents:'",
      `aws s3 ls s3://${artifactBucket.bucketName}/`,
      `aws s3 ls s3://${artifactBucket.bucketName}/current/`,

      // Download and extract application
      "echo 'Downloading application files...'",
      `aws s3 sync s3://${artifactBucket.bucketName}/current/ . --quiet`,

      // List contents to verify
      "echo 'Contents of /var/www/html:'",
      "ls -la /var/www/html",

      // Install PM2 and symlink-dir globally
      "echo 'Setting up PM2 permissions'",
      "mkdir -p /root/.pm2",
      "chmod -R 777 /root/.pm2",
      "export PM2_HOME=/root/.pm2",
      "echo 'Installing symlink-dir'",
      "npm install -g symlink-dir",
      "npm install -g pm2",

      // Install dependencies
      "echo 'Installing dependencies'",
      "npm install --omit=dev",

      // Create production environment file
      "echo 'Creating environment file'",
      "cat << EOF > /var/www/html/.env.production",
      `NEXT_PUBLIC_TILE_SERVER_URL=${this.config.TILE_SERVER_URL || ""}`,
      `NEXT_PUBLIC_STAC_CATALOG_URL=${this.config.STAC_CATALOG_URL || ""}`,
      `NEXT_PUBLIC_S3_API_URL=${this.config.S3_API_URL || ""}`,
      `NEXT_PUBLIC_MODEL_RUNNER_API_URL=${this.config.MODEL_RUNNER_API_URL || ""}`,
      `NEXT_PUBLIC_OIDC_AUTHORITY=${props.auth?.authority || ""}`,
      `NEXTAUTH_URL=${this.config.AUTH_SUCCESS_URL || ""}`,
      `NEXTAUTH_CLIENT_ID=${this.config.AUTH_CLIENT_ID || ""}`,
      `NEXTAUTH_SECRET=${this.config.AUTH_SECRET || ""}`,
      "EOF",

      // Start the application with PM2
      "echo 'Starting Next.js application with PM2'",
      "pm2 install pm2-logrotate",
      "pm2 set pm2-logrotate:max_size 10M",
      "pm2 set pm2-logrotate:retain 5",
      "NODE_ENV=production pm2 start npm --name 'next-app' -- start",
      "pm2 save",
      "pm2 startup",
      "echo 'Verifying PM2 status'",
      "PM2_HOME=/root/.pm2 pm2 list",
      "PM2_HOME=/root/.pm2 pm2 logs --lines 20 --nostream || true",

      // Start services
      "echo 'Starting services'",
      "systemctl start nginx",
      "systemctl enable nginx",

      "echo 'User data script completed'",

      // Print final status
      "echo 'Final service status:'",
      "echo 'Nginx status:'",
      "systemctl status nginx",
      "echo 'PM2 final status:'",
      "pm2 list",
      "echo 'Listening ports:'",
      "netstat -tulpn | grep -E ':(80|3000)'"
    );

    const ec2Role = new Role(this, "EC2InstanceRole", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore") // Basic SSM access
      ]
    });

    // Create Launch Template
    const launchTemplate = new LaunchTemplate(this, "WebAppLaunchTemplate", {
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      machineImage: new AmazonLinux2023ImageSsmParameter(),
      userData,
      securityGroup: this.ec2SecurityGroup,
      role: ec2Role
    });

    // Create ASG using Launch Template
    const asg = new AutoScalingGroup(this, "WebAppAsg", {
      vpc: props.osmlVpc.vpc,
      launchTemplate: launchTemplate,
      minCapacity: 2,
      maxCapacity: 4
    });

    // Add instance refresh trigger
    new AwsCustomResource(this, "InstanceRefreshTrigger", {
      onUpdate: {
        service: "AutoScaling",
        action: "startInstanceRefresh",
        parameters: {
          AutoScalingGroupName: asg.autoScalingGroupName,
          Preferences: {
            MinHealthyPercentage: 50,
            InstanceWarmup: Duration.minutes(2).toSeconds()
          }
        },
        physicalResourceId: PhysicalResourceId.of(Date.now().toString())
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [asg.autoScalingGroupArn]
      })
    });

    // Grant S3 read access to EC2 instances
    artifactBucket.grantRead(asg.role);

    // Add ASG to ALB target group
    listener.addTargets("WebAppTarget", {
      port: 80,
      targets: [asg],
      healthCheck: {
        path: "/",
        unhealthyThresholdCount: 2,
        healthyThresholdCount: 5,
        interval: Duration.seconds(30)
      }
    });
  }

  private getNginxConfig(): string {
    return `cat << 'EOF' > /etc/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile            on;
    tcp_nopush          on;
    tcp_nodelay         on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include             /etc/nginx/mime.types;
    default_type        application/octet-stream;

    server {
        listen       80;
        server_name  ${this.config.DOMAIN_NAME ?? "*********"};

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
    }
}
EOF`;
  }

  private createGithubArtifactFunction(targetBucket: IBucket): Function {
    const fn = new Function(this, "GithubArtifactFunction", {
      runtime: Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: Code.fromInline(`
const AWS = require('aws-sdk');
const https = require('https');
const s3 = new AWS.S3();

exports.handler = async (event) => {
  const props = event.ResourceProperties;
  const { GithubOwner, GithubRepo } = props;

  try {
    // Get latest release info
    const releaseInfo = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.github.com',
        path: \`/repos/\${GithubOwner}/\${GithubRepo}/releases/latest\`,
        headers: { 'User-Agent': 'AWS Lambda' }
      };

      https.get(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    // Get asset download URL
    const assetUrl = releaseInfo.assets.find(a => a.name === 'build.zip').browser_download_url;

    // Download artifact
    const artifact = await new Promise((resolve, reject) => {
      https.get(assetUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });

    // Upload to S3
    await s3.putObject({
      Bucket: '${targetBucket.bucketName}',
      Key: 'current/build.zip',
      Body: artifact
    }).promise();

    return { PhysicalResourceId: 'GithubArtifactDeployment' };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}`),
      timeout: Duration.minutes(5)
    });

    targetBucket.grantWrite(fn);
    return fn;
  }

  private setup(props: UIDataplaneProps): void {
    this.config = props.config ?? new UIDataplaneConfig();

    // Setup a removal policy
    this.removalPolicy = props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;

    this.regionalS3Endpoint = RegionalConfig.getConfig(
      props.account.region
    ).s3Endpoint;

    if (this.config.ALB_SECURITY_GROUP_ID) {
      this.albSecurityGroup = SecurityGroup.fromSecurityGroupId(
        this,
        "UIALBImportSecurityGroup",
        this.config.ALB_SECURITY_GROUP_ID
      );
    } else {
      this.albSecurityGroup = new SecurityGroup(this, "AlbSecurityGroup", {
        vpc: props.osmlVpc.vpc,
        allowAllOutbound: true,
        description: "Security group for UI ALB"
      });
      this.albSecurityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(80),
        "Allow HTTP traffic"
      );
      this.albSecurityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(443),
        "Allow HTTPS traffic"
      );
    }

    if (this.config.EC2_SECURITY_GROUP_ID) {
      this.ec2SecurityGroup = SecurityGroup.fromSecurityGroupId(
        this,
        "UIEC2ImportSecurityGroup",
        this.config.EC2_SECURITY_GROUP_ID
      );
    } else {
      this.ec2SecurityGroup = new SecurityGroup(this, "Ec2SecurityGroup", {
        vpc: props.osmlVpc.vpc,
        allowAllOutbound: true,
        description: "Security group for UI EC2 instances"
      });

      this.ec2SecurityGroup.addIngressRule(
        this.albSecurityGroup,
        Port.tcp(80),
        "Allow traffic from UI ALB"
      );
    }
  }
}
// -------------------------------------------------------------

export interface WebAppStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
}

export class WebAppStack extends Stack {
  public resources: UIDataplane;

  /**
   * Constructor for the web app dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created UIDataplaneStack object
   */
  constructor(parent: App, name: string, props: WebAppStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create the web app dataplane
    this.resources = new UIDataplane(this, "UIDataplane", {
      account: appConfig.account,
      osmlVpc: props.osmlVpc,
      config: appConfig.webApp?.config
        ? new UIDataplaneConfig(appConfig.webApp.config)
        : undefined,
      auth: appConfig.auth ? appConfig.auth : undefined
    });
  }
}

export function deployWebApp(vpcStack: OSMLVpcStack): WebAppStack {
  return new WebAppStack(appConfig.app, `${appConfig.projectName}-WebApp`, {
    env: {
      account: appConfig.account.id,
      region: appConfig.account.region
    },
    description:
      "OSML Web App, Guidance for Processing Overhead Imagery on AWS (SO9240)",
    osmlVpc: vpcStack.resources
  });
}
