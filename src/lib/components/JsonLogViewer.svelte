<script lang="ts">
    interface Props {
        message?: string;
        class?: string;
    }
    let { message = "", class: className = "" }: Props = $props();

    function escapeHtmlBlock(str: string) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function formatMessage(msg: string) {
        if (!msg) return "";
        try {
            const obj = JSON.parse(msg);
            if (typeof obj === "object" && obj !== null) {
                const jsonStr = JSON.stringify(obj, null, 2);
                let highlighted = escapeHtmlBlock(jsonStr);
                highlighted = highlighted.replace(
                    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
                    function (match) {
                        let cls = "text-blue-400";
                        if (/^"/.test(match)) {
                            if (/:$/.test(match)) {
                                cls = "text-blue-300";
                            } else {
                                cls = "text-green-400";
                            }
                        } else if (/true|false/.test(match)) {
                            cls = "text-yellow-400";
                        } else if (/null/.test(match)) {
                            cls = "text-gray-500";
                        } else {
                            cls = "text-orange-400";
                        }
                        return '<span class="' + cls + '">' + match + "</span>";
                    },
                );
                return highlighted;
            }
        } catch {
            // Not JSON
        }
        return escapeHtmlBlock(msg);
    }
</script>

<div class="whitespace-pre-wrap leading-relaxed break-all font-mono {className}">
    {@html formatMessage(message)}
</div>
