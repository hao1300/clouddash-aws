<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    import { EditorView, basicSetup } from 'codemirror';
    import { json } from '@codemirror/lang-json';
    import { oneDark } from '@codemirror/theme-one-dark';

    let { value = $bindable(""), readonly = false, language = "json", onchange = () => {} } = $props<{
        value?: string;
        readonly?: boolean;
        language?: "json" | "text";
        onchange?: (val: string) => void;
    }>();

    let editorContainer: HTMLDivElement;
    let view: EditorView;

    let internalChange = false;

    $effect(() => {
        if (view && !internalChange) {
            const currentDoc = view.state.doc.toString();
            if (currentDoc !== value) {
                view.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: value }
                });
            }
        }
        internalChange = false;
    });

    onMount(() => {
        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged && update.view.hasFocus) {
                internalChange = true;
                const newVal = update.state.doc.toString();
                value = newVal;
                onchange(newVal);
            }
        });

        const extensions = [
            basicSetup,
            oneDark,
            updateListener,
            EditorView.lineWrapping
        ];

        if (language === "json") {
            extensions.push(json());
        }

        if (readonly) {
            extensions.push(EditorView.editable.of(false));
        }

        view = new EditorView({
            doc: value,
            extensions,
            parent: editorContainer
        });

        return () => {
            view.destroy();
        };
    });
</script>

<div bind:this={editorContainer} class="w-full h-full min-h-[200px] rounded overflow-hidden border border-gray-700"></div>

<style>
    :global(.cm-editor) {
        height: 100%;
        outline: none !important;
        background-color: #0d1117 !important;
    }
    :global(.cm-scroller) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        font-size: 13px;
    }
    :global(.cm-gutters) {
        background-color: #0d1117 !important;
        border-right: 1px solid #30363d !important;
        color: #6e7681 !important;
    }
    :global(.cm-activeLineGutter) {
        background-color: #161b22 !important;
        color: #c9d1d9 !important;
    }
    :global(.cm-activeLine) {
        background-color: #161b22 !important;
    }
</style>
