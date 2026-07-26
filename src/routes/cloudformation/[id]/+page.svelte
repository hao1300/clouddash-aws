<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    // Stack details moved into the master/detail view on /cloudformation. Keep this
    // route as a redirect so existing links and bookmarks still resolve.
    $effect(() => {
        const id = $page.params.id;
        goto(
            id
                ? `/cloudformation?stack=${encodeURIComponent(id)}`
                : "/cloudformation",
            { replaceState: true },
        );
    });
</script>

<div
    class="h-full flex items-center justify-center text-gray-500 text-xs uppercase tracking-widest"
>
    Redirecting...
</div>
