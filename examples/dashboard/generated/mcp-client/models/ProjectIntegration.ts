/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectIntegration = {
    ds?: any | null;
    mcp?: any | null;
    summary?: {
        path?: string | null;
        detectors?: Array<string>;
        registryPath?: string;
        registryPresent?: boolean;
        manifestValid?: boolean | null;
        ready: string;
    };
    /**
     * epoch ms
     */
    checkedAt?: number;
};

