import type { Page } from "@sveltejs/kit";

export interface ServiceTab {
    id: string;
    label: string;
}

export interface ServiceEntry {
    label: string;
    icon: string;
    tabs: Record<string, string>;
    resourcePrefix?: string;
    contextualTabs?: string[];
}

/**
 * Centralized manifest mapping routes to service and sub-service labels.
 */
export const SERVICE_MANIFEST: Record<string, ServiceEntry> = {
    cloudwatch: {
        label: "CloudWatch",
        icon: "/icons/cloudwatch.svg",
        tabs: {
            alarms: "Alarms",
            metrics: "Metrics",
            logs: "Log Groups",
            insights: "Logs Insights",
        }
    },
    ec2: {
        label: "EC2",
        icon: "/icons/ec2.svg",
        tabs: {
            instances: "Instances",
            amis: "AMIs",
            volumes: "Volumes",
            snapshots: "Snapshots",
            "security-groups": "Security Groups",
            "key-pairs": "Key Pairs",
            "elastic-ips": "Elastic IPs",
        },
        resourcePrefix: "/instances",
        contextualTabs: []
    },
    s3: {
        label: "S3",
        icon: "/icons/s3.svg",
        tabs: {
            objects: "Objects",
            details: "Details",
        },
        resourcePrefix: "/bucket",
        contextualTabs: ["objects", "details"]
    },
    dynamodb: {
        label: "DynamoDB",
        icon: "/icons/dynamodb.svg",
        tabs: {
            "explore": "Explore",
            "details": "Details",
        },
        resourcePrefix: "/table",
        contextualTabs: ["explore", "details"]
    },
    sqs: {
        label: "SQS",
        icon: "/icons/sqs.svg",
        tabs: {
            messages: "Messages",
            metrics: "Metrics",
        },
        resourcePrefix: "/queue",
        contextualTabs: ["messages", "metrics"]
    },
    cloudfront: {
        label: "CloudFront",
        icon: "/icons/cloudfront.svg",
        tabs: {
        }
    },
    stepfunctions: {
        label: "Step Functions",
        icon: "/icons/stepfunctions.svg",
        tabs: {
        }
    },
    lambda: {
        label: "Lambda",
        icon: "/icons/lambda.svg",
        tabs: {
        }
    },
    sns: {
        label: "SNS",
        icon: "/icons/sns.svg",
        tabs: {
            "": "Topics",
            subscriptions: "Subscriptions",
        }
    },
    iam: {
        label: "IAM",
        icon: "/icons/iam.svg",
        tabs: {
            users: "Users",
            groups: "Groups",
            roles: "Roles",
            policies: "Policies",
        }
    },
    secretsmanager: {
        label: "Secrets Manager",
        icon: "/icons/secretsmanager.svg",
        tabs: {
        }
    },
    elasticbeanstalk: {
        label: "Elastic Beanstalk",
        icon: "/icons/elasticbeanstalk.svg",
        tabs: {
            environment: "Environments",
            application: "Application",
            versions: "Application Versions",
        }
    },
    cloudformation: {
        label: "CloudFormation",
        icon: "/icons/cloudformation.svg",
        tabs: {
        }
    },
    ses: {
        label: "SES",
        icon: "/icons/ses.svg",
        tabs: {
        }
    }
};
