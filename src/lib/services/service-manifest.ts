import type { Page } from "@sveltejs/kit";

export interface ServiceTab {
    id: string;
    label: string;
}

export interface ServiceEntry {
    label: string;
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
        tabs: {
            alarms: "Alarms",
            metrics: "Metrics",
            logs: "Log Groups",
            insights: "Logs Insights",
        }
    },
    ec2: {
        label: "EC2",
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
        tabs: {
            objects: "Objects",
            details: "Details",
        },
        resourcePrefix: "/bucket",
        contextualTabs: ["objects", "details"]
    },
    dynamodb: {
        label: "DynamoDB",
        tabs: {
            "explore": "Explore",
            "details": "Details",
        },
        resourcePrefix: "/table",
        contextualTabs: ["explore", "details"]
    },
    sqs: {
        label: "SQS",
        tabs: {
            messages: "Messages",
            metrics: "Metrics",
        },
        resourcePrefix: "/queue",
        contextualTabs: ["messages", "metrics"]
    },
    cloudfront: {
        label: "CloudFront",
        tabs: {
        }
    },
    stepfunctions: {
        label: "Step Functions",
        tabs: {
        }
    },
    lambda: {
        label: "Lambda",
        tabs: {
        }
    },
    sns: {
        label: "SNS",
        tabs: {
            "": "Topics",
            subscriptions: "Subscriptions",
        }
    },
    iam: {
        label: "IAM",
        tabs: {
            users: "Users",
            groups: "Groups",
            roles: "Roles",
            policies: "Policies",
        }
    },
    secretsmanager: {
        label: "Secrets Manager",
        tabs: {
        }
    },
    elasticbeanstalk: {
        label: "Elastic Beanstalk",
        tabs: {
            environment: "Environments",
            application: "Application",
            versions: "Application Versions",
        }
    },
    cloudformation: {
        label: "CloudFormation",
        tabs: {
        }
    },
    ses: {
        label: "SES",
        tabs: {
        }
    }
};
