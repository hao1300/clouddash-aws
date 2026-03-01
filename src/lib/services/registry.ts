import type { Component } from 'svelte';
import CloudWatch from './CloudWatch.svelte';
import EC2 from './EC2.svelte';
import S3 from './S3.svelte';
import DynamoDB from './DynamoDB.svelte';
import SQS from './SQS.svelte';
import CloudFront from './CloudFront.svelte';
import StepFunctions from './StepFunctions.svelte';
import Lambda from './Lambda.svelte';
import SNS from './SNS.svelte';
import IAM from './IAM.svelte';
import SecretsManager from './SecretsManager.svelte';
import ElasticBeanstalk from './ElasticBeanstalk.svelte';
import CloudFormation from './CloudFormation.svelte';
import SES from './SES.svelte';

export interface ServiceDef {
    id: string;
    label: string;
    component: Component;
    defaultEnabled: boolean;
}

/**
 * Service registry — to add a new service:
 *   1. Create YourService.svelte in this folder
 *   2. Import it above and add one entry here
 *   3. Create the matching Rust module in src-tauri/src/services/
 *   4. Add `pub mod your_service;` to services/mod.rs
 *   5. Register the command in lib.rs invoke_handler
 */
export const services: ServiceDef[] = [
    { id: 'cloudwatch', label: 'CloudWatch', component: CloudWatch as unknown as Component, defaultEnabled: true },
    { id: 'ec2', label: 'EC2', component: EC2 as unknown as Component, defaultEnabled: true },
    { id: 's3', label: 'S3', component: S3 as unknown as Component, defaultEnabled: true },
    { id: 'dynamodb', label: 'DynamoDB', component: DynamoDB as unknown as Component, defaultEnabled: true },
    { id: 'sqs', label: 'SQS', component: SQS as unknown as Component, defaultEnabled: true },
    { id: 'cloudfront', label: 'CloudFront', component: CloudFront as unknown as Component, defaultEnabled: true },
    { id: 'stepfunctions', label: 'Step Functions', component: StepFunctions as unknown as Component, defaultEnabled: true },
    { id: 'lambda', label: 'Lambda', component: Lambda as unknown as Component, defaultEnabled: true },
    { id: 'sns', label: 'SNS', component: SNS as unknown as Component, defaultEnabled: true },
    { id: 'iam', label: 'IAM', component: IAM as unknown as Component, defaultEnabled: true },
    { id: 'secretsmanager', label: 'Secrets Manager', component: SecretsManager as unknown as Component, defaultEnabled: true },
    { id: 'elasticbeanstalk', label: 'Elastic Beanstalk', component: ElasticBeanstalk as unknown as Component, defaultEnabled: true },
    { id: 'cloudformation', label: 'CloudFormation', component: CloudFormation as unknown as Component, defaultEnabled: true },
    { id: 'ses', label: 'SES', component: SES as unknown as Component, defaultEnabled: true },
];
