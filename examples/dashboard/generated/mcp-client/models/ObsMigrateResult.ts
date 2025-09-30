/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ObsMigrateResult = {
    ok: boolean;
    migrated: Array<{
        base: string;
        idDir: string;
        wrote?: number;
        error?: string;
    }>;
};

