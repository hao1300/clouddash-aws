import { StreamLanguage, type StreamParser } from "@codemirror/language";

interface PropertiesState {
    inValue: boolean;
    continuesOnNextLine: boolean;
}

const propertiesParser: StreamParser<PropertiesState> = {
    name: "properties",

    startState: () => ({
        inValue: false,
        continuesOnNextLine: false,
    }),

    token(stream, state) {
        if (stream.sol()) {
            state.inValue = state.continuesOnNextLine;
            state.continuesOnNextLine = false;

            if (!state.inValue) {
                stream.eatSpace();
                const firstCharacter = stream.peek();
                if (firstCharacter === "#" || firstCharacter === "!") {
                    stream.skipToEnd();
                    return "comment";
                }
            }
        }

        const style = state.inValue ? "string" : "property";

        while (!stream.eol()) {
            const character = stream.next();

            if (character === "\\") {
                if (stream.eol()) {
                    state.continuesOnNextLine = true;
                } else {
                    stream.next();
                }
                continue;
            }

            if (!state.inValue && character === "=") {
                if (stream.pos - stream.start > 1) {
                    stream.backUp(1);
                    return style;
                }

                state.inValue = true;
                return null;
            }
        }

        return style;
    },
};

export const propertiesLanguage = StreamLanguage.define(propertiesParser);
