/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ObsValidateResult = {
    ok: boolean;
    telemetry: {
        reachable: boolean;
    };
    registry: {
        path: string;
        exists: boolean;
    };
    dirs: Array<{
        path: string;
        exists: boolean;
        projects?: number;
        files?: number;
    }>;
    counts: {
        totalProjects: number;
        totalFiles: number;
    };
};

