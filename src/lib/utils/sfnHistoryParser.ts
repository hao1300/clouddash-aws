import type { HistoryEvent } from "@aws-sdk/client-sfn";

export type StateStatus = 'SUCCEEDED' | 'FAILED' | 'RUNNING' | 'PENDING' | 'CAUGHT';

export interface StateExecutionDetails {
    status: StateStatus;
    input: any;
    output: any;
    resource?: string;
    error?: any;
    logs?: any;
    lastEventId?: number;
}

export function parseHistoryEvents(events: HistoryEvent[]) {
    const stateDetails: Record<string, StateExecutionDetails> = {};
    const eventIdMap: Record<number, string> = {};
    
    // Sort chronological
    const sorted = [...events].sort((a,b) => ((a.id || 0) - (b.id || 0)));

    for (const event of sorted) {
        if (!event.id) continue;
        
        let stateName = '';
        
        // Association logic
        if (event.stateEnteredEventDetails) {
            stateName = event.stateEnteredEventDetails.name || '';
        } else if (event.stateExitedEventDetails) {
            stateName = event.stateExitedEventDetails.name || '';
        } else if (event.previousEventId && eventIdMap[event.previousEventId]) {
            stateName = eventIdMap[event.previousEventId];
        }

        if (stateName) {
            eventIdMap[event.id] = stateName;
            
            if (!stateDetails[stateName]) {
                stateDetails[stateName] = { 
                    status: 'RUNNING', 
                    input: event.stateEnteredEventDetails?.input || null, 
                    output: null 
                };
            }
        }

        if (!stateName) continue;

        // Success tracking
        if (event.stateExitedEventDetails) {
            // If it already failed, it means it was caught
            if (stateDetails[stateName].status === 'FAILED') {
                stateDetails[stateName].status = 'CAUGHT';
            } else if (stateDetails[stateName].status === 'RUNNING') {
                stateDetails[stateName].status = 'SUCCEEDED';
            }
            stateDetails[stateName].output = event.stateExitedEventDetails.output;
            stateDetails[stateName].lastEventId = event.id;
        }

        // Failure tracking
        const type = event.type?.toLowerCase() || '';
        const isFailure = 
            type.includes('failed') || 
            type.includes('timedout') || 
            type.includes('aborted');

        if (isFailure) {
            // Check if it's an execution-level failure or state-level
            if (type.startsWith('execution')) {
                // For execution level, we mark all currently RUNNING states as FAILED
                for (const d of Object.values(stateDetails)) {
                    if (d.status === 'RUNNING') d.status = 'FAILED';
                }
            } else {
                // For state-specific failures
                stateDetails[stateName].status = 'FAILED';
                stateDetails[stateName].lastEventId = event.id;
                
                // Try to extract error info
                const details = 
                    event.taskFailedEventDetails || 
                    event.taskTimedOutEventDetails || 
                    event.taskStartFailedEventDetails ||
                    event.taskSubmitFailedEventDetails ||
                    event.lambdaFunctionFailedEventDetails ||
                    event.lambdaFunctionTimedOutEventDetails ||
                    event.lambdaFunctionStartFailedEventDetails ||
                    event.lambdaFunctionScheduleFailedEventDetails ||
                    event.activityFailedEventDetails ||
                    event.activityTimedOutEventDetails ||
                    event.activityScheduleFailedEventDetails ||
                    event.mapRunFailedEventDetails ||
                    event.evaluationFailedEventDetails;
                
                if (details) {
                    stateDetails[stateName].error = details;
                }
            }
        }

        // Resource associations
        if (event.lambdaFunctionScheduledEventDetails) {
            stateDetails[stateName].resource = event.lambdaFunctionScheduledEventDetails.resource;
        } else if (event.taskScheduledEventDetails) {
            // A nested state machine arrives as a TaskScheduled event; the target ARN
            // is only available inside the JSON parameters payload.
            const scheduled = event.taskScheduledEventDetails;
            let resource = scheduled.resource;
            if (scheduled.resourceType === "states" && scheduled.parameters) {
                try {
                    const params = JSON.parse(scheduled.parameters);
                    if (typeof params.StateMachineArn === "string") {
                        resource = params.StateMachineArn;
                    }
                } catch {
                    // Malformed parameters — fall back to the integration resource.
                }
            }
            stateDetails[stateName].resource = resource;
        }
    }

    return stateDetails;
}
