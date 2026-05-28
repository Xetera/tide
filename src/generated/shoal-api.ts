/**
 * Auto-generated from Shoal's OpenAPI spec. Do not edit by hand.
 * Regenerate with: pnpm api:types
 * Source: http://localhost:4000/api/openapi
 */

export interface paths {
    "/api/auth/api_keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a new API key */
        post: operations["AuthController.create_api_key"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Log in with email and password */
        post: operations["AuthController.login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Log out */
        post: operations["AuthController.logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register a new account */
        post: operations["AuthController.register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health check */
        get: operations["HealthController.index"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/assets/{sha256}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload an asset */
        post: operations["AssetController.upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/invites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a single-use invite token */
        post: operations["PoolController.create_invite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Join a pool using an invite token */
        post: operations["PoolController.join"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/sites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List sites configured for a pool */
        get: operations["PoolController.get_sites"];
        /** Replace the sites configured for a pool */
        put: operations["PoolController.set_sites"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/workers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List workers in a pool */
        get: operations["PoolWorkerController.index"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/workers/me/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Worker heartbeat */
        get: operations["HeartbeatController.ping"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/workers/me/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Poll for pending jobs */
        get: operations["WorkerController.poll"];
        put?: never;
        /** Submit a scrape job result */
        post: operations["WorkerController.submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/workers/me/sites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get sites the worker is configured to scrape */
        get: operations["WorkerController.sites"];
        /** Update the worker's opted-in sites */
        put: operations["WorkerController.update_sites"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pool/{pool_id}/workers/{worker_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get a single worker */
        get: operations["PoolWorkerController.show"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pools": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List pools */
        get: operations["PoolController.index"];
        put?: never;
        /** Create a pool */
        post: operations["PoolController.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AccountResponse */
        AccountResponse: {
            /** Format: email */
            email: string;
            /** Format: uuid */
            id: string;
        };
        /** ApiKeyResponse */
        ApiKeyResponse: {
            /** Format: uuid */
            id: string;
            key: string;
        };
        /**
         * EntityPatch
         * @description A single scraped entity. Requires either `_entity` + `_id` keys, or JSON-LD style `@type` (containing a `shoal:*` type) + `@id`. All other keys are entity-specific data.
         */
        EntityPatch: {
            [key: string]: unknown;
        };
        /** ErrorResponse */
        ErrorResponse: {
            error: string;
        };
        /** ErrorsResponse */
        ErrorsResponse: {
            errors: {
                [key: string]: string[];
            };
        };
        /** HealthResponse */
        HealthResponse: {
            /** @enum {string} */
            status: "ok";
        };
        /** InviteResponse */
        InviteResponse: {
            token: string;
        };
        /** JobItem */
        JobItem: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            issued_at: string;
            /** Format: uri */
            url: string;
        };
        /**
         * JobSource
         * @description Identifies the job a submission is reporting on. `passive` is an opportunistic scrape; `active` references a server-issued crawl job by id.
         */
        JobSource: {
            /**
             * Format: uuid
             * @description Crawl job id (required when kind is active)
             */
            id?: string;
            /** @enum {string} */
            kind: "passive" | "active";
        };
        /** JoinResponse */
        JoinResponse: {
            worker_secret: string;
        };
        /** PollResponse */
        PollResponse: {
            jobs: components["schemas"]["JobItem"][];
            refetch: string[];
        };
        /** PoolListResponse */
        PoolListResponse: components["schemas"]["PoolResponse"][];
        /** PoolResponse */
        PoolResponse: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        /** SitesResponse */
        SitesResponse: {
            sites: string[];
        };
        /** SubmitAssetsResult */
        SubmitAssetsResult: {
            offloading: string[];
            upload_required: string[];
        };
        /** SubmitEntityError */
        SubmitEntityError: {
            error: {
                [key: string]: unknown;
            };
            index: number;
        };
        /** SubmitRequest */
        SubmitRequest: {
            /** @description Optional source funnel describing where the scrape originated */
            funnel?: {
                [key: string]: unknown;
            };
            job?: components["schemas"]["JobSource"];
            patches: components["schemas"]["EntityPatch"][];
            /** @description Echoed by clients; ignored server-side */
            success?: boolean;
            warnings?: string[];
        };
        /** SubmitResponse */
        SubmitResponse: {
            assets: components["schemas"]["SubmitAssetsResult"];
            entities: {
                [key: string]: unknown;
            }[];
            errors: components["schemas"]["SubmitEntityError"][];
            /** Format: uuid */
            id: string;
        };
        /** WorkerListResponse */
        WorkerListResponse: components["schemas"]["WorkerResponse"][];
        /** WorkerResponse */
        WorkerResponse: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            inserted_at: string;
            /** Format: date-time */
            last_seen_at?: string | null;
            nickname?: string | null;
            online: boolean;
            /** Format: uuid */
            worker_id: string;
        };
        /** WorkerSitesResponse */
        WorkerSitesResponse: {
            name: string;
            sites: string[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "AuthController.create_api_key": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description API key created */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKeyResponse"];
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Login credentials */
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description Authenticated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountResponse"];
                };
            };
            /** @description Invalid credentials */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Logged out */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
        };
    };
    "AuthController.register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Registration params */
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    password: string;
                    password_confirmation?: string;
                };
            };
        };
        responses: {
            /** @description Account created */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountResponse"];
                };
            };
            /** @description Validation error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorsResponse"];
                };
            };
        };
    };
    "HealthController.index": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    "AssetController.upload": {
        parameters: {
            query?: {
                /** @description Upload token */
                token?: string;
            };
            header?: {
                /** @description Upload token (alternative to query param) */
                "x-upload-token"?: string;
            };
            path: {
                /** @description Pool ID */
                pool_id: string;
                /** @description SHA-256 hex digest of the asset body */
                sha256: string;
            };
            cookie?: never;
        };
        /** @description Raw asset bytes */
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Stored */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Already stored */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unsupported media type */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolController.create_invite": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Invite created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InviteResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Pool not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolController.join": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        /** @description Join params */
        requestBody: {
            content: {
                "application/json": {
                    invite_token: string;
                    /** Format: uuid */
                    worker_id: string;
                };
            };
        };
        responses: {
            /** @description Joined */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JoinResponse"];
                };
            };
            /** @description Bad request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Invite not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Already used */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolController.get_sites": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sites */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SitesResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Pool not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolController.set_sites": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        /** @description Sites list */
        requestBody: {
            content: {
                "application/json": {
                    sites: string[];
                };
            };
        };
        responses: {
            /** @description Updated */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Pool not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolWorkerController.index": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Workers */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkerListResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Pool not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "HeartbeatController.ping": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    "WorkerController.poll": {
        parameters: {
            query?: {
                /** @description Set to 'active' to claim queued crawl jobs */
                autonomy?: string;
            };
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Jobs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PollResponse"];
                };
            };
        };
    };
    "WorkerController.submit": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        /** @description Job submission */
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitRequest"];
            };
        };
        responses: {
            /** @description Submitted */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubmitResponse"];
                };
            };
            /** @description Invalid patches */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorsResponse"];
                };
            };
        };
    };
    "WorkerController.sites": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sites */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkerSitesResponse"];
                };
            };
        };
    };
    "WorkerController.update_sites": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
            };
            cookie?: never;
        };
        /** @description Sites list */
        requestBody: {
            content: {
                "application/json": {
                    sites: string[];
                };
            };
        };
        responses: {
            /** @description Updated */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolWorkerController.show": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pool ID */
                pool_id: string;
                /** @description Worker ID */
                worker_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Worker */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkerResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PoolController.index": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pool list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoolListResponse"];
                };
            };
        };
    };
    "PoolController.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Pool params */
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                };
            };
        };
        responses: {
            /** @description Pool created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoolResponse"];
                };
            };
            /** @description Validation error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorsResponse"];
                };
            };
        };
    };
}
