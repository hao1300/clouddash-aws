<script lang="ts">
    import { formatJsonMessage } from "$lib/utils/json-highlight";

    interface Props {
        message?: string;
        class?: string;
    }
    let { message = "", class: className = "" }: Props = $props();
</script>

<div class="whitespace-pre-wrap leading-relaxed break-all font-mono {className}">
    {@html formatJsonMessage(message)}
</div>
