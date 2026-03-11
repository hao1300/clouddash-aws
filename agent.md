# CloudWatch AWS Console - Agent Conventions

This document outlines architectural patterns and coding conventions to ensure consistency across the codebase.

## Page Titles and Breadcrumbs (`titleService`)

The application uses a reactive `titleService` (defined in `src/lib/services/title.svelte.ts`) to manage breadcrumbs and page titles. This service is path-aware and supports hierarchical, clickable resources.

### 1. Global Initialization
The root layout (`src/routes/+layout.svelte`) handles the primary title update based on the URL:
```svelte
$effect(() => {
    titleService.updateFromUrl($page.url.pathname);
});
```
This sets the initial `service` (e.g., CloudWatch) and `subservice` (e.g., Alarms or Metrics) based on the path prefix.

### 2. Page-Level Resource Setting
Page components are responsible for setting the specific `resource` (the breadcrumb tail) using `$effect`.

#### **Standard Detail Page**
For a simple detail page, use `setResource`:
```typescript
$effect(() => {
    if (resourceName) {
        titleService.setResource(resourceName);
    }
});
```

#### **Nested/Hierarchical Breadcrumbs**
For nested routes (e.g., Metrics > [Namespace] > [MetricName]), establish the hierarchy using `setResource` for the parent and `addResource` for the child:
```typescript
$effect(() => {
    if (namespace && metricName) {
        // Set context-aware parent (clickable)
        titleService.setResource(
            namespace, 
            `/cloudwatch/metrics/${encodeURIComponent(namespace)}`
        );
        // Add current resource
        titleService.addResource(metricName);
    }
});
```

### 3. Clickable Resources
Always provide a second argument (`href`) to `setResource` or `addResource` if the breadcrumb segment should navigate back to a logical parent or list view.

### 4. Path Awareness
The `titleService` automatically filters resources based on the current path. A resource added for a specific path will only be displayed if that path is a prefix of the browser's current URL. This prevents "stale" breadcrumbs during SPA navigation.
