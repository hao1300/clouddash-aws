import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { EC2Client } from "@aws-sdk/client-ec2";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { SFNClient } from "@aws-sdk/client-sfn";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SNSClient } from "@aws-sdk/client-sns";
import { IAMClient } from "@aws-sdk/client-iam";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ElasticBeanstalkClient } from "@aws-sdk/client-elastic-beanstalk";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { SESClient } from "@aws-sdk/client-ses";
import { fetch } from "@tauri-apps/plugin-http";
import { getAwsCredentials } from "./aws-creds";

const customRequestHandler = {
    handle: async (request: any) => {
        const proto = request.protocol?.replace(/:$/, "") || "https";
        let url = request.hostname
            ? `${proto}://${request.hostname}${request.port ? ":" + request.port : ""}${request.path}`
            : request.path;

        if (request.query && Object.keys(request.query).length > 0) {
            const qs = Object.entries(request.query)
                .map(([k, v]) => {
                    if (Array.isArray(v)) {
                        return v
                            .map((vi) => `${encodeURIComponent(k)}=${encodeURIComponent(String(vi))}`)
                            .join("&");
                    }
                    return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
                })
                .join("&");
            url += (url.includes("?") ? "&" : "?") + qs;
        }

        const headers: Record<string, string> = {};
        if (request.headers) {
            const forbidden = ["host", "content-length", "connection", "expect", "te", "trailer", "transfer-encoding", "upgrade", "via", "keep-alive"];
            for (const [key, value] of Object.entries(request.headers)) {
                if (forbidden.includes(key.toLowerCase())) continue;
                headers[key] = String(value);
            }
        }

        const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body != null;

        const resp = await fetch(url, {
            method: request.method,
            headers,
            body: hasBody ? request.body : undefined,
        });

        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((value: string, key: string) => {
            respHeaders[key] = value;
        });

        const bodyBytes = new Uint8Array(await resp.arrayBuffer());
        const bodyStream = new ReadableStream({
            start(controller) {
                controller.enqueue(bodyBytes);
                controller.close();
            },
        });

        return {
            response: new (await import("@smithy/protocol-http")).HttpResponse({
                statusCode: resp.status,
                headers: respHeaders,
                body: bodyStream,
            }),
        };
    },
} as any;

class AwsState {
    #creds = $state<any>(null);

    constructor() {
        this.refresh();
    }

    async refresh() {
        try {
            this.#creds = await getAwsCredentials();
        } catch (e) {
            console.error("Failed to refresh AWS credentials:", e);
        }
    }

    #config = $derived.by(() => {
        if (!this.#creds) return null;
        return {
            region: this.#creds.region,
            credentials: {
                accessKeyId: this.#creds.access_key_id,
                secretAccessKey: this.#creds.secret_access_key,
                sessionToken: this.#creds.session_token || undefined,
            },
            requestHandler: customRequestHandler
        };
    });

    cw = $derived(this.#config ? new CloudWatchClient(this.#config) : null);
    cwLogs = $derived(this.#config ? new CloudWatchLogsClient(this.#config) : null);
    ec2 = $derived(this.#config ? new EC2Client(this.#config) : null);
    s3 = $derived(this.#config ? new S3Client(this.#config) : null);
    dynamodb = $derived(this.#config ? new DynamoDBClient(this.#config) : null);
    sqs = $derived(this.#config ? new SQSClient(this.#config) : null);
    cloudfront = $derived(this.#config ? new CloudFrontClient(this.#config) : null);
    sfn = $derived(this.#config ? new SFNClient(this.#config) : null);
    lambda = $derived(this.#config ? new LambdaClient(this.#config) : null);
    sns = $derived(this.#config ? new SNSClient(this.#config) : null);
    iam = $derived(this.#config ? new IAMClient(this.#config) : null);
    secretsManager = $derived(this.#config ? new SecretsManagerClient(this.#config) : null);
    elasticBeanstalk = $derived(this.#config ? new ElasticBeanstalkClient(this.#config) : null);
    cloudFormation = $derived(this.#config ? new CloudFormationClient(this.#config) : null);
    ses = $derived(this.#config ? new SESClient(this.#config) : null);

    #s3Clients = new Map<string, S3Client>();
    #cwClients = new Map<string, CloudWatchClient>();
    #bucketRegions = new Map<string, string>();

    primeBucketRegion(bucketName: string, region: string) {
        this.#bucketRegions.set(bucketName, region);
    }

    getS3Client(region?: string): S3Client | null {
        if (!this.#config) return null;
        if (!region || region === this.#config.region) return this.s3;
        
        if (this.#s3Clients.has(region)) return this.#s3Clients.get(region)!;
        
        const client = new S3Client({ ...this.#config, region });
        this.#s3Clients.set(region, client);
        return client;
    }

    getCWClient(region?: string): CloudWatchClient | null {
        if (!this.#config) return null;
        if (!region || region === this.#config.region) return this.cw;
        
        if (this.#cwClients.has(region)) return this.#cwClients.get(region)!;
        
        const client = new CloudWatchClient({ ...this.#config, region });
        this.#cwClients.set(region, client);
        return client;
    }

    async getBucketRegion(bucketName: string): Promise<string> {
        if (this.#bucketRegions.has(bucketName)) {
            return this.#bucketRegions.get(bucketName)!;
        }
        if (!this.s3) throw new Error("AWS not initialized");
        try {
            const { GetBucketLocationCommand } = await import("@aws-sdk/client-s3");
            const res = await this.s3.send(new GetBucketLocationCommand({ Bucket: bucketName }));
            let region = res.LocationConstraint || "us-east-1";
            if (region === "EU") region = "eu-west-1";
            this.#bucketRegions.set(bucketName, region);
            return region;
        } catch(e: any) {
            if (e.$response?.headers?.["x-amz-bucket-region"]) {
                const headerRegion = e.$response.headers["x-amz-bucket-region"];
                this.#bucketRegions.set(bucketName, headerRegion);
                return headerRegion;
            }
            console.warn(`Failed to get bucket location for ${bucketName}`, e);
            return this.#config?.region || "us-east-1";
        }
    }

    async getS3ClientForBucket(bucketName: string): Promise<S3Client | null> {
        const region = await this.getBucketRegion(bucketName);
        return this.getS3Client(region);
    }

    async getCWClientForBucket(bucketName: string): Promise<CloudWatchClient | null> {
        const region = await this.getBucketRegion(bucketName);
        return this.getCWClient(region);
    }
}

export const aws = new AwsState();
