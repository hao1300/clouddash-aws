import { describe, expect, it, vi } from "vitest";
import {
    getStateMachineDetailsHref,
    getStateMachineName,
    resolveStateMachineArnByName,
} from "./sfnStateMachine";

describe("Step Functions state-machine identity", () => {
    it("extracts the stable name from an account- and region-specific ARN", () => {
        expect(
            getStateMachineName(
                "arn:aws:states:us-east-1:111122223333:stateMachine:ProcessOrder",
            ),
        ).toBe("ProcessOrder");
        expect(getStateMachineName("ProcessOrder")).toBe("ProcessOrder");
    });

    it("builds name-based details links", () => {
        expect(getStateMachineDetailsHref("Order Processor")).toBe(
            "/stepfunctions/details?name=Order%20Processor",
        );
    });

    it("paginates until it finds the same name in the active context", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce({
                stateMachines: [
                    {
                        name: "OtherMachine",
                        stateMachineArn:
                            "arn:aws:states:us-west-2:444455556666:stateMachine:OtherMachine",
                    },
                ],
                nextToken: "page-2",
            })
            .mockResolvedValueOnce({
                stateMachines: [
                    {
                        name: "ProcessOrder",
                        stateMachineArn:
                            "arn:aws:states:us-west-2:444455556666:stateMachine:ProcessOrder",
                    },
                ],
            });

        await expect(
            resolveStateMachineArnByName("ProcessOrder", listPage),
        ).resolves.toBe(
            "arn:aws:states:us-west-2:444455556666:stateMachine:ProcessOrder",
        );
        expect(listPage).toHaveBeenNthCalledWith(1, undefined);
        expect(listPage).toHaveBeenNthCalledWith(2, "page-2");
    });
});
