import { CloudWatchClient, DescribeAlarmHistoryCommand, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
console.log(typeof DescribeAlarmHistoryCommand);
console.log(typeof GetMetricStatisticsCommand);
console.log(typeof FilterLogEventsCommand);
