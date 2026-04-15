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
                    event.lambdaFunctionFailedEventDetails || 
                    event.lambdaFunctionTimedOutEventDetails || 
                    event.parallelStateFailedEventDetails ||
                    event.activityFailedEventDetails ||
                    event.activityTimedOutEventDetails ||
                    event.mapStateFailedEventDetails;
                
                if (details) {
                    stateDetails[stateName].error = details;
                }
            }
        }

        // Resource associations
        if (event.lambdaFunctionScheduledEventDetails) {
            stateDetails[stateName].resource = event.lambdaFunctionScheduledEventDetails.resource;
        } else if (event.taskScheduledEventDetails) {
            stateDetails[stateName].resource = event.taskScheduledEventDetails.resource;
        } else if (event.stateMachineScheduledEventDetails) {
            stateDetails[stateName].resource = event.stateMachineScheduledEventDetails.stateMachineArn;
        }
    }

    return stateDetails;
}
