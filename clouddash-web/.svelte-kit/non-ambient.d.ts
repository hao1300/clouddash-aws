
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/contact" | "/download" | "/pricing" | "/privacy";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/contact": Record<string, never>;
			"/download": Record<string, never>;
			"/pricing": Record<string, never>;
			"/privacy": Record<string, never>
		};
		Pathname(): "/" | "/contact" | "/download" | "/pricing" | "/privacy";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/android.png" | "/apple-touch-icon.png" | "/dashboard.png" | "/favicon-96x96.png" | "/favicon.ico" | "/favicon.svg" | "/modern.css" | "/screenshots/android-alarm-details.jpg" | "/screenshots/android-cloudwatch-logs.jpg" | "/screenshots/android-dynamodb-items.jpg" | "/screenshots/android-dynamodb-query.jpg" | "/screenshots/android-lambda-payloads.jpg" | "/screenshots/android-sqs-list.jpg" | "/screenshots/aws-iam.png" | "/screenshots/cloudfront-metrics.png" | "/screenshots/cloudwatch-alarms.png" | "/screenshots/ec2-metrics.png" | "/screenshots/logs-insights.png" | "/screenshots/s3-preview.png" | "/site.webmanifest" | "/web-app-manifest-192x192.png" | "/web-app-manifest-512x512.png" | string & {};
	}
}