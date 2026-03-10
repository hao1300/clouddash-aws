/**
 * Centralized manifest mapping routes to service and sub-service labels.
 */
export const SERVICE_MANIFEST: Record<string, { label: string; tabs: Record<string, string> }> = {
    cloudwatch: {
        label: "CloudWatch",
        tabs: {
            "": "Alarms",
            metrics: "Metrics",
            dashboards: "Dashboards",
            logs: "Log Groups",
            insights: "Logs Insights",
        }
    },
    ec2: {
        label: "EC2",
        tabs: {
            "": "Instances",
            details: "Details",
            amis: "AMIs",
            volumes: "Volumes",
            snapshots: "Snapshots",
            "security-groups": "Security Groups",
            "key-pairs": "Key Pairs",
            "elastic-ips": "Elastic IPs",
        }
    },
    s3: {
        label: "S3",
        tabs: {
            "": "Buckets",
        }
    },
    dynamodb: {
        label: "DynamoDB",
        tabs: {
            "": "Tables",
        }
    },
    sqs: {
        label: "SQS",
        tabs: {
            "": "Queues",
        }
    },
    cloudfront: {
        label: "CloudFront",
        tabs: {
            "": "Distributions",
        }
    },
    stepfunctions: {
        label: "Step Functions",
        tabs: {
            "": "State Machines",
        }
    },
    lambda: {
        label: "Lambda",
        tabs: {
            "": "Functions",
            details: "Details",
        }
    },
    sns: {
        label: "SNS",
        tabs: {
            "": "Topics",
            "platform-apps": "Platform Applications",
            subscriptions: "Subscriptions",
        }
    },
    iam: {
        label: "IAM",
        tabs: {
            "": "Users",
            groups: "Groups",
            roles: "Roles",
            policies: "Policies",
        }
    },
    secretsmanager: {
        label: "Secrets Manager",
        tabs: {
            "": "Secrets",
            details: "Details",
        }
    },
    elasticbeanstalk: {
        label: "Elastic Beanstalk",
        tabs: {
            "": "Environments",
            applications: "Applications",
            versions: "Application Versions",
        }
    },
    cloudformation: {
        label: "CloudFormation",
        tabs: {
            "": "Stacks",
            details: "Details",
            exports: "Exports",
            "stack-sets": "StackSets",
        }
    },
    ses: {
        label: "SES",
        tabs: {
            "": "Identities",
            "configuration-sets": "Configuration Sets",
            templates: "Templates",
        }
    }
};
