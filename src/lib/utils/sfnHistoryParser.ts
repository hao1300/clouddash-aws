import type { HistoryEvent } from "@aws-sdk/client-sfn";

export type StateStatus = 'SUCCEEDED' | 'FAILED' | 'RUNNING' | 'PENDING' | 'CAUGHT';

export interface StateExecutionDetails {
    status: StateStatus;
    input: any;
    output: any;
    error?: any;
    logs?: any;
}

export function parseHistoryEvents(events: HistoryEvent[]) {
    const stateDetails: Record<string, StateExecutionDetails> = {};
    
    // Sort chronological
    const sorted = [...events].sort((a,b) => ((a.id || 0) - (b.id || 0)));

    for (const event of sorted) {
        if (!event.type) continue;
        
        let stateName = '';
        
        if (event.stateEnteredEventDetails) {
            stateName = event.stateEnteredEventDetails.name || '';
            
            if (!stateDetails[stateName]) {
                stateDetails[stateName] = { 
                    status: 'RUNNING', 
                    input: event.stateEnteredEventDetails.input, 
                    output: null 
                };
            } else {
                stateDetails[stateName].status = 'RUNNING'; 
                stateDetails[stateName].input = event.stateEnteredEventDetails.input;
            }
        }
        
        if (event.stateExitedEventDetails) {
            stateName = event.stateExitedEventDetails.name || '';
            if (stateDetails[stateName]) {
                stateDetails[stateName].status = 'SUCCEEDED';
                stateDetails[stateName].output = event.stateExitedEventDetails.output;
            }
        }
    }

    const hasFailed = sorted.find(e => e.type?.includes('Failed') || e.type?.includes('Aborted') || e.type?.includes('TimedOut'));
    
    for (const [name, details] of Object.entries(stateDetails)) {
        if (details.status === 'RUNNING' && hasFailed) {
            details.status = 'FAILED';
        }
    }

    return stateDetails;
}
