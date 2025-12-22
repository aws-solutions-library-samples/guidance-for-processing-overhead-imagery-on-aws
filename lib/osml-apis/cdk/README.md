# OSML APIs

The OSML APIs component provides a unified API Gateway layer for the OversightML (OSML) solution, enabling secure external access to internal services through JWT-based authentication.

## Overview

This Phase 3 infrastructure component creates:

- A centralized Lambda authorizer that validates JWT tokens against a Keycloak auth server
- Conditional API Gateway integrations for backend services based on configuration
- Custom domain support with Route53 DNS and ACM certificates

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              External Access                                 │
│                                                                             │
│                            ┌──────────────┐                                 │
│                            │   Client     │                                 │
│                            └──────┬───────┘                                 │
│                                   │                                         │
├───────────────────────────────────┼─────────────────────────────────────────┤
│                          API Gateway Layer                                   │
│                                   │                                         │
│     ┌─────────────────────────────┼─────────────────────────────┐          │
│     │                             │                             │          │
│     ▼                             ▼                             ▼          │
│ ┌─────────────┐           ┌─────────────┐           ┌─────────────┐        │
│ │ Tile Server │           │ Data Intake │           │ Geo Agents  │        │
│ │   API GW    │           │   API GW    │           │   API GW    │        │
│ └──────┬──────┘           └──────┬──────┘           └──────┬──────┘        │
│        │                         │                         │               │
│        └─────────────────────────┼─────────────────────────┘               │
│                                  │                                         │
│                                  ▼                                         │
│                         ┌────────────────┐                                 │
│                         │    Lambda      │                                 │
│                         │   Authorizer   │                                 │
│                         └────────┬───────┘                                 │
│                                  │                                         │
├──────────────────────────────────┼──────────────────────────────────────────┤
│                                 VPC                                         │
│                                  │                                         │
│     ┌────────────────────────────┼────────────────────────────┐            │
│     │                            │                            │            │
│     ▼                            ▼                            ▼            │
│ ┌─────────────┐           ┌─────────────┐           ┌─────────────┐        │
│ │  Keycloak   │           │ Tile Server │           │ Geo Agents  │        │
│ │ Auth Server │           │     ALB     │           │     ALB     │        │
│ └─────────────┘           └─────────────┘           └─────────────┘        │
│                                                                             │
│                           ┌─────────────┐                                  │
│                           │ STAC Lambda │                                  │
│                           └─────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Supported Integrations

| Integration    | Backend Type   | Description                      |
| -------------- | -------------- | -------------------------------- |
| Tile Server    | VPC Link (ALB) | Map tile rendering service       |
| Data Intake    | Lambda Proxy   | STAC catalog management API      |
| Geo Agents MCP | VPC Link (ALB) | Geospatial AI agent capabilities |

Each integration is conditionally deployed based on configuration - only provide the URL/ARN for services you want to expose.

## Prerequisites

- AWS CDK v2.x
- Node.js 24+
- An existing VPC with private subnets (from osml-vpc)
- A deployed Keycloak auth server (from amazon-mission-solutions-auth-server)
- Backend services deployed (Tile Server, Data Intake, and/or Geo Agents)

## Configuration

Create a `deployment.json` file in `bin/deployment/` based on the example:

```json
{
  "projectName": "OSML-APIs",
  "account": {
    "id": "123456789012",
    "region": "us-west-2",
    "prodLike": false,
    "isAdc": false
  },
  "networkConfig": {
    "VPC_ID": "vpc-xxxxxxxxxxxxxxxxx",
    "TARGET_SUBNETS": ["subnet-xxxxxxxxxxxxxxxxx", "subnet-yyyyyyyyyyyyyyyyy"],
    "SECURITY_GROUP_ID": "sg-xxxxxxxxxxxxxxxxx"
  },
  "dataplaneConfig": {
    "authConfig": {
      "authority": "https://keycloak.example.com/realms/osml",
      "audience": "osml-client"
    },
    "TILE_SERVER_URL": "http://internal-osml-tile-server-alb.us-west-2.elb.amazonaws.com",
    "DATA_INTAKE_LAMBDA_ARN": "arn:aws:lambda:us-west-2:123456789012:function:data-catalog-stac",
    "GEO_AGENTS_MCP_URL": "http://internal-osml-geo-agents-alb.us-west-2.elb.amazonaws.com",
    "CORS_ALLOWED_ORIGINS": ["https://app.example.com"]
  }
}
```

### Configuration Options

#### Account Configuration

| Field      | Type    | Required | Description                                                               |
| ---------- | ------- | -------- | ------------------------------------------------------------------------- |
| `id`       | string  | Yes      | AWS account ID                                                            |
| `region`   | string  | Yes      | AWS region                                                                |
| `prodLike` | boolean | Yes      | Enable production settings (termination protection, longer log retention) |
| `isAdc`    | boolean | Yes      | Amazon Dedicated Cloud environment flag                                   |

#### Network Configuration

| Field               | Type     | Required | Description                                       |
| ------------------- | -------- | -------- | ------------------------------------------------- |
| `VPC_ID`            | string   | Yes      | VPC ID for Lambda authorizer deployment           |
| `TARGET_SUBNETS`    | string[] | No       | Specific subnet IDs (defaults to private subnets) |
| `SECURITY_GROUP_ID` | string   | No       | Security group ID (creates new if not provided)   |

#### Dataplane Configuration

| Field                    | Type     | Required | Description                                        |
| ------------------------ | -------- | -------- | -------------------------------------------------- |
| `authConfig.authority`   | string   | Yes      | OIDC issuer URL (Keycloak realm)                   |
| `authConfig.audience`    | string   | Yes      | Expected JWT audience claim                        |
| `TILE_SERVER_URL`        | string   | No       | Internal ALB URL for Tile Server                   |
| `DATA_INTAKE_LAMBDA_ARN` | string   | No       | Lambda ARN for STAC API                            |
| `GEO_AGENTS_MCP_URL`     | string   | No       | Internal ALB URL for Geo Agents                    |
| `CORS_ALLOWED_ORIGINS`   | string[] | No       | Allowed CORS origins (defaults to `*` in non-prod) |

#### Custom Domain Configuration (Optional)

| Field                     | Type   | Required | Description                                                 |
| ------------------------- | ------ | -------- | ----------------------------------------------------------- |
| `DOMAIN_HOSTED_ZONE_ID`   | string | No       | Route53 hosted zone ID                                      |
| `DOMAIN_HOSTED_ZONE_NAME` | string | No       | Domain name (e.g., `example.com`)                           |
| `DOMAIN_CERTIFICATE_ARN`  | string | No       | ACM certificate ARN (creates wildcard cert if not provided) |

When custom domain is configured, APIs are accessible at:

- `tile-server.{domain}`
- `data-catalog.{domain}`
- `geo-agent-mcp.{domain}`

## Deployment

### Install Dependencies

```bash
cd lib/osml-apis/cdk
npm install
```

### Build

```bash
npm run build
```

### Synthesize CloudFormation

```bash
npx cdk synth
```

### Deploy

```bash
npx cdk deploy --all
```

### Deploy Specific Stacks

```bash
# Deploy network stack only
npx cdk deploy OSML-APIs-Network

# Deploy APIs stack only (requires network stack)
npx cdk deploy OSML-APIs
```

## Stack Outputs

After deployment, the following outputs are available:

| Output                  | Description              | Condition                              |
| ----------------------- | ------------------------ | -------------------------------------- |
| `AuthorizerFunctionArn` | Lambda authorizer ARN    | Always                                 |
| `TileServerApiUrl`      | Tile Server API endpoint | When `TILE_SERVER_URL` provided        |
| `DataIntakeApiUrl`      | Data Intake API endpoint | When `DATA_INTAKE_LAMBDA_ARN` provided |
| `GeoAgentsMcpApiUrl`    | Geo Agents API endpoint  | When `GEO_AGENTS_MCP_URL` provided     |

## Authentication

All API requests (except CORS preflight) require a valid JWT token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <jwt_token>" https://tile-server.example.com/api/tiles/...
```

The Lambda authorizer validates:

- Token signature against the OIDC provider's public keys
- Token expiration
- Audience claim matches configured value
- Issuer matches configured authority

## Development

### Run Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

### CDK NAG Compliance

The component includes cdk-nag suppressions with documented justifications for:

- AWS managed policies for Lambda execution
- API Gateway authorization patterns (custom authorizer vs Cognito)
- CORS preflight handling

## Dependencies

This component depends on:

- **osml-vpc**: Provides the VPC infrastructure
- **amazon-mission-solutions-auth-server**: Provides Keycloak for JWT validation

## License

This project is licensed under the Apache-2.0 License.
