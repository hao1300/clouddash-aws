<script lang="ts">
    import { onMount } from 'svelte';
    import { EditorView, keymap } from '@codemirror/view';
    import { EditorState } from '@codemirror/state';
    import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
    import { syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
    import { autocompletion, CompletionContext, type Completion } from '@codemirror/autocomplete';
    import { oneDark } from '@codemirror/theme-one-dark';
    import { tags } from '@lezer/highlight';
    import { lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
    import { bracketMatching } from '@codemirror/language';

    let { value = $bindable(""), fields = [], onrun = () => {} } = $props<{
        value?: string;
        fields?: { name: string; percent?: number }[];
        onrun?: () => void;
    }>();

    let editorContainer: HTMLDivElement;
    let view = $state<EditorView | null>(null);
    let internalChange = false;

    // ── CloudWatch Logs Insights language definition ──
    const CWL_COMMANDS = [
        'fields', 'filter', 'sort', 'stats', 'limit', 'parse', 'display',
        'dedup', 'unmask'
    ];
    const CWL_FUNCTIONS = [
        'count', 'avg', 'sum', 'min', 'max', 'pct', 'stddev',
        'earliest', 'latest',
        'abs', 'ceil', 'floor', 'sqrt', 'log', 'ln',
        'strlen', 'trim', 'ltrim', 'rtrim', 'replace', 'toupper', 'tolower', 'substr', 'concat',
        'strcontains', 'ispresent', 'isempty', 'isblank', 'isValidIp', 'isValidIpV4', 'isValidIpV6',
        'datefloor', 'dateceil', 'fromMillis', 'toMillis',
        'bin', 'coalesce'
    ];
    const CWL_SORT_KEYWORDS = ['asc', 'desc'];
    const CWL_OPERATORS = ['and', 'or', 'not', 'in', 'like', 'as', 'by'];
    const CWL_BUILTIN_FIELDS = [
        '@timestamp', '@logStream', '@message', '@log', '@logGroup',
        '@duration', '@billedDuration', '@type', '@maxMemoryUsed',
        '@memorySize', '@requestId', '@ingestionTime', '@ptr'
    ];

    const commandSet = new Set(CWL_COMMANDS.map(w => w.toLowerCase()));
    const functionSet = new Set(CWL_FUNCTIONS.map(w => w.toLowerCase()));
    const sortKwSet = new Set(CWL_SORT_KEYWORDS.map(w => w.toLowerCase()));
    const operatorSet = new Set(CWL_OPERATORS.map(w => w.toLowerCase()));

    const cwlLanguage = StreamLanguage.define({
        startState: () => ({ inString: false, stringChar: '' }),
        token(stream: any, state: any) {
            // Handle strings
            if (state.inString) {
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === '\\') {
                        stream.next(); // skip escaped char
                    } else if (ch === state.stringChar) {
                        state.inString = false;
                        return 'string';
                    }
                }
                return 'string';
            }

            // Skip whitespace
            if (stream.eatSpace()) return null;

            // Comments (# to end of line)
            if (stream.match('#')) {
                stream.skipToEnd();
                return 'comment';
            }

            // Pipe operator
            if (stream.eat('|')) {
                return 'punctuation';
            }

            // Strings
            const quote = stream.peek();
            if (quote === '"' || quote === "'") {
                stream.next();
                state.inString = true;
                state.stringChar = quote;
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === '\\') {
                        stream.next();
                    } else if (ch === quote) {
                        state.inString = false;
                        return 'string';
                    }
                }
                return 'string';
            }

            // @-prefixed fields
            if (stream.eat('@')) {
                stream.eatWhile(/[\w]/);
                return 'variableName.special';
            }

            // Numbers
            if (stream.match(/^-?\d+(\.\d+)?/)) {
                return 'number';
            }

            // Comparison operators
            if (stream.match(/^[><=!]=?/)) {
                return 'operator';
            }

            // Regex pattern /pattern/
            if (stream.peek() === '/') {
                stream.next();
                let escaped = false;
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (ch === '/') {
                        return 'regexp';
                    }
                }
                return 'regexp';
            }

            // Parentheses, commas, brackets
            if (stream.eat(/[(),\[\]]/)) {
                return 'punctuation';
            }

            // Words (keywords, functions, operators, identifiers)
            if (stream.match(/^[a-zA-Z_][\w.]*/)) {
                const word = stream.current().toLowerCase();
                if (commandSet.has(word)) return 'keyword';
                if (functionSet.has(word)) return 'function(definition)';
                if (operatorSet.has(word)) return 'logicOperator';
                if (sortKwSet.has(word)) return 'modifier';
                return 'variableName';
            }

            // Asterisk (wildcard)
            if (stream.eat('*')) {
                return 'operator';
            }

            // Any other character
            stream.next();
            return null;
        }
    });

    // ── Custom highlight style for CWL ──
    const cwlHighlightStyle = HighlightStyle.define([
        { tag: tags.keyword, color: '#ff7b72', fontWeight: 'bold' },         // commands: fields, filter, sort…
        { tag: tags.function(tags.definition(tags.variableName)), color: '#d2a8ff' }, // functions: count, avg…
        { tag: tags.logicOperator, color: '#ff7b72' },                        // and, or, not…
        { tag: tags.modifier, color: '#ffa657', fontStyle: 'italic' },        // asc, desc
        { tag: tags.special(tags.variableName), color: '#79c0ff' },           // @timestamp, @message…
        { tag: tags.variableName, color: '#c9d1d9' },                         // user fields
        { tag: tags.string, color: '#a5d6ff' },                               // strings
        { tag: tags.number, color: '#79c0ff' },                               // numbers
        { tag: tags.comment, color: '#6e7681', fontStyle: 'italic' },         // comments
        { tag: tags.punctuation, color: '#8b949e' },                          // pipes, parens
        { tag: tags.operator, color: '#ff7b72' },                             // >, <, =, !=
        { tag: tags.regexp, color: '#7ee787' },                               // regex
    ]);

    // ── Autocomplete ──
    function cwlCompletions(context: CompletionContext) {
        // Match word characters and @ prefix
        const word = context.matchBefore(/[@\w.]*/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        const text = word.text.toLowerCase();
        const completions: Completion[] = [];

        // Command completions
        for (const cmd of CWL_COMMANDS) {
            if (cmd.toLowerCase().startsWith(text)) {
                completions.push({
                    label: cmd,
                    type: 'keyword',
                    detail: 'command',
                    boost: 3
                });
            }
        }

        // Function completions
        for (const fn of CWL_FUNCTIONS) {
            if (fn.toLowerCase().startsWith(text)) {
                completions.push({
                    label: fn,
                    type: 'function',
                    detail: 'function',
                    apply: fn + '(',
                    boost: 2
                });
            }
        }

        // Sort keywords
        for (const kw of CWL_SORT_KEYWORDS) {
            if (kw.toLowerCase().startsWith(text)) {
                completions.push({ label: kw, type: 'keyword', detail: 'sort order', boost: 1 });
            }
        }

        // Operator keywords
        for (const op of CWL_OPERATORS) {
            if (op.toLowerCase().startsWith(text)) {
                completions.push({ label: op, type: 'keyword', detail: 'operator', boost: 1 });
            }
        }

        // Built-in @fields
        for (const f of CWL_BUILTIN_FIELDS) {
            if (f.toLowerCase().startsWith(text)) {
                completions.push({
                    label: f,
                    type: 'variable',
                    detail: 'built-in field',
                    boost: 2
                });
            }
        }

        // Dynamic fields from log group
        for (const f of fields) {
            const fieldName = f.name;
            if (fieldName.toLowerCase().startsWith(text) && !CWL_BUILTIN_FIELDS.includes(fieldName)) {
                completions.push({
                    label: fieldName,
                    type: 'property',
                    detail: f.percent != null ? `${f.percent}% of events` : 'field',
                    boost: 1
                });
            }
        }

        return {
            from: word.from,
            options: completions,
            validFor: /^[@\w.]*$/
        };
    }

    // ── Ctrl+Enter keybinding to run query ──
    const runQueryKeymap = keymap.of([{
        key: 'Ctrl-Enter',
        run: () => { onrun(); return true; },
    }, {
        key: 'Mod-Enter',
        run: () => { onrun(); return true; },
    }]);

    // ── Sync external value changes into editor ──
    $effect(() => {
        const _val = value !== undefined ? value : "";
        if (view && !internalChange) {
            const currentDoc = view.state.doc.toString();
            if (currentDoc !== _val) {
                view.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: _val }
                });
            }
        }
        internalChange = false;
    });

    // ── Update completions when fields change ──
    $effect(() => {
        // Touch fields to trigger reactivity
        const _fields = fields;
        if (view) {
            // Recreate completion source - the closure captures current fields
            view.dispatch({
                effects: autocompletionCompartment.reconfigure(
                    autocompletion({
                        override: [cwlCompletions],
                        activateOnTyping: true,
                        icons: true
                    })
                )
            });
        }
    });

    // ── Compartment for dynamic autocomplete reconfiguration ──
    import { Compartment } from '@codemirror/state';
    const autocompletionCompartment = new Compartment();

    // ── Editor theme overrides ──
    const editorTheme = EditorView.theme({
        '&': {
            backgroundColor: 'rgba(3, 7, 17, 0.5) !important',
            fontSize: '13px',
        },
        '.cm-content': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            caretColor: '#79c0ff',
            padding: '8px 0',
        },
        '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
        '.cm-gutters': {
            backgroundColor: 'rgba(3, 7, 17, 0.5) !important',
            borderRight: '1px solid #30363d !important',
            color: '#6e7681 !important',
        },
        '.cm-activeLineGutter': {
            backgroundColor: '#161b22 !important',
            color: '#c9d1d9 !important',
        },
        '.cm-activeLine': {
            backgroundColor: 'rgba(22, 27, 34, 0.5) !important',
        },
        '.cm-cursor': {
            borderLeftColor: '#79c0ff',
        },
        '.cm-selectionBackground': {
            backgroundColor: 'rgba(56, 139, 253, 0.2) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(56, 139, 253, 0.3) !important',
        },
        '.cm-tooltip': {
            backgroundColor: '#1c2128 !important',
            border: '1px solid #30363d !important',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        },
        '.cm-tooltip-autocomplete': {
            '& > ul': {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '12px',
            },
            '& > ul > li': {
                padding: '4px 8px',
                color: '#c9d1d9',
            },
            '& > ul > li[aria-selected]': {
                backgroundColor: 'rgba(56, 139, 253, 0.2) !important',
                color: '#ffffff',
            }
        },
        '.cm-completionLabel': {
            color: '#c9d1d9',
        },
        '.cm-completionDetail': {
            color: '#8b949e',
            fontStyle: 'italic',
            marginLeft: '8px',
        },
        '.cm-completionMatchedText': {
            color: '#79c0ff',
            textDecoration: 'none',
            fontWeight: 'bold',
        },
    });

    onMount(() => {
        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged && update.view.hasFocus) {
                internalChange = true;
                const newVal = update.state.doc.toString();
                value = newVal;
            }
        });

        view = new EditorView({
            state: EditorState.create({
                doc: value,
                extensions: [
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    highlightActiveLine(),
                    history(),
                    bracketMatching(),
                    cwlLanguage,
                    syntaxHighlighting(cwlHighlightStyle),
                    autocompletionCompartment.of(
                        autocompletion({
                            override: [cwlCompletions],
                            activateOnTyping: true,
                            icons: true
                        })
                    ),
                    editorTheme,
                    oneDark,
                    keymap.of([...defaultKeymap, ...historyKeymap]),
                    runQueryKeymap,
                    updateListener,
                    EditorView.lineWrapping,
                ]
            }),
            parent: editorContainer
        });

        return () => {
            if (view) view.destroy();
        };
    });
</script>

<div bind:this={editorContainer} class="insights-editor w-full rounded-lg overflow-hidden border border-gray-700 focus-within:border-blue-500 transition-colors"></div>

<style>
    .insights-editor {
        min-height: 120px;
        max-height: 300px;
    }
    .insights-editor :global(.cm-editor) {
        height: 100%;
        min-height: 120px;
        max-height: 300px;
        outline: none !important;
    }
    .insights-editor :global(.cm-scroller) {
        overflow: auto;
    }
</style>
