import { describe, it, expect } from "vitest";
import type { HistoryEvent } from "@aws-sdk/client-sfn";
import { parseHistoryEvents } from "./sfnHistoryParser";

/** Minimal chronological history entering a state, then failing/scheduling in it. */
function history(...events: Partial<HistoryEvent>[]): HistoryEvent[] {
    return events as HistoryEvent[];
}

describe("parseHistoryEvents", () => {
    it("associates events with the state they occurred in", () => {
        const out = parseHistoryEvents(
            history(
                {
                    id: 1,
                    type: "TaskStateEntered",
                    stateEnteredEventDetails: { name: "DoWork", input: '{"a":1}' },
                },
                {
                    id: 2,
                    type: "TaskSucceeded",
                    previousEventId: 1,
                },
            ),
        );
        expect(Object.keys(out)).toContain("DoWork");
    });

    // Regression: the failure chain previously referenced
    // parallelStateFailedEventDetails / mapStateFailedEventDetails, which do not
    // exist in the Step Functions API. Real failure types were silently skipped,
    // so the UI showed no error at all.
    it.each([
        ["taskFailedEventDetails", "TaskFailed"],
        ["taskStartFailedEventDetails", "TaskStartFailed"],
        ["taskSubmitFailedEventDetails", "TaskSubmitFailed"],
        ["lambdaFunctionFailedEventDetails", "LambdaFunctionFailed"],
        ["lambdaFunctionStartFailedEventDetails", "LambdaFunctionStartFailed"],
        ["activityFailedEventDetails", "ActivityFailed"],
        ["mapRunFailedEventDetails", "MapRunFailed"],
        ["evaluationFailedEventDetails", "EvaluationFailed"],
    ])("captures the error carried on %s", (field, type) => {
        const out: any = parseHistoryEvents(
            history(
                {
                    id: 1,
                    type: "TaskStateEntered",
                    stateEnteredEventDetails: { name: "S", input: "{}" },
                },
                {
                    id: 2,
                    type: type as any,
                    previousEventId: 1,
                    [field]: { error: "Boom", cause: "because" },
                } as any,
            ),
        );
        const details = out["S"];
        expect(details.error, `${field} should reach stateDetails.error`).toBeTruthy();
        expect(details.error.error).toBe("Boom");
    });

    // Regression: a nested state machine arrives as TaskScheduled with the
    // generic integration ARN in `resource`; the real target is only inside the
    // JSON `parameters` payload.
    it("resolves a nested state machine ARN from taskScheduled parameters", () => {
        const target = "arn:aws:states:us-east-1:123456789012:stateMachine:Child";
        const out: any = parseHistoryEvents(
            history(
                {
                    id: 1,
                    type: "TaskStateEntered",
                    stateEnteredEventDetails: { name: "Nested", input: "{}" },
                },
                {
                    id: 2,
                    type: "TaskScheduled",
                    previousEventId: 1,
                    taskScheduledEventDetails: {
                        resourceType: "states",
                        resource: "startExecution.sync",
                        parameters: JSON.stringify({ StateMachineArn: target }),
                    },
                } as any,
            ),
        );
        expect(out["Nested"].resource).toBe(target);
    });

    it("falls back to the integration resource when parameters are malformed", () => {
        const out: any = parseHistoryEvents(
            history(
                {
                    id: 1,
                    type: "TaskStateEntered",
                    stateEnteredEventDetails: { name: "Nested", input: "{}" },
                },
                {
                    id: 2,
                    type: "TaskScheduled",
                    previousEventId: 1,
                    taskScheduledEventDetails: {
                        resourceType: "states",
                        resource: "startExecution.sync",
                        parameters: "{not json",
                    },
                } as any,
            ),
        );
        expect(out["Nested"].resource).toBe("startExecution.sync");
    });
});
