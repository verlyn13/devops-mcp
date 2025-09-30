/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ObsMigrateResult } from '../models/ObsMigrateResult';
import type { ObsValidateResult } from '../models/ObsValidateResult';
import type { ProjectIntegration } from '../models/ProjectIntegration';
import type { ProjectManifestValidationResult } from '../models/ProjectManifestValidationResult';
import type { ServiceDiscovery } from '../models/ServiceDiscovery';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class DefaultService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Telemetry info
     * @returns any OK
     * @throws ApiError
     */
    public getApiTelemetryInfo(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/telemetry-info',
        });
    }
    /**
     * List projects
     * @returns any OK
     * @throws ApiError
     */
    public getApiProjects(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/projects',
        });
    }
    /**
     * Project integration probe
     * @returns ProjectIntegration OK
     * @throws ApiError
     */
    public getApiProjects1({
        id,
    }: {
        id: string,
    }): CancelablePromise<ProjectIntegration> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/projects/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Validate project.manifest.yaml
     * @returns ProjectManifestValidationResult OK
     * @throws ApiError
     */
    public getApiProjectsManifest({
        id,
    }: {
        id: string,
    }): CancelablePromise<ProjectManifestValidationResult> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/projects/{id}/manifest',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Merged NDJSON observers
     * @returns any OK
     * @throws ApiError
     */
    public getApiObsProjectsObservers(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/obs/projects/{id}/observers',
        });
    }
    /**
     * Filtered observer lines
     * @returns any OK
     * @throws ApiError
     */
    public getApiObsProjectsObserver(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/obs/projects/{id}/observer/{type}',
        });
    }
    /**
     * Validate observer dirs and registry presence
     * @returns any OK
     * @throws ApiError
     */
    public getApiObsValidate(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/obs/validate',
        });
    }
    /**
     * Trigger discovery
     * @returns any OK
     * @throws ApiError
     */
    public getApiDiscover(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/discover',
        });
    }
    /**
     * Run observer
     * @returns any OK
     * @throws ApiError
     */
    public postApiToolsProjectObsRun(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/tools/project_obs_run',
        });
    }
    /**
     * MCP self-status
     * @returns any OK
     * @throws ApiError
     */
    public getApiMcpSelfStatus(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/mcp/self-status',
        });
    }
    /**
     * Run observation validation (tool)
     * @returns ObsValidateResult OK
     * @throws ApiError
     */
    public postApiToolsObsValidate(): CancelablePromise<ObsValidateResult> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/tools/obs_validate',
        });
    }
    /**
     * Migrate per-observer files into observations.ndjson
     * @returns ObsMigrateResult OK
     * @throws ApiError
     */
    public postApiToolsObsMigrate(): CancelablePromise<ObsMigrateResult> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/tools/obs_migrate',
        });
    }
    /**
     * Serve schema JSON with ETag
     * @returns any OK
     * @throws ApiError
     */
    public getApiSchemas(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/schemas/{name}',
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * List available schema files
     * @returns any OK
     * @throws ApiError
     */
    public getApiDiscoverySchemas(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/discovery/schemas',
        });
    }
    /**
     * Service discovery (DS/MCP/registry)
     * @returns ServiceDiscovery OK
     * @throws ApiError
     */
    public getApiDiscoveryServices(): CancelablePromise<ServiceDiscovery> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/discovery/services',
        });
    }
}
