/**
 * MCP TypeScript Client Demo
 *
 * This example demonstrates how to use the generated TypeScript client
 * to interact with the DevOps MCP Bridge API.
 */

import { Configuration, DefaultApi } from '../src/generated/mcp-client';
import axios from 'axios';

// Configuration with authentication
const config = new Configuration({
  basePath: 'http://127.0.0.1:4319',
  accessToken: 'devops-mcp-bridge-token-2024',
  baseOptions: {
    headers: {
      'Authorization': 'Bearer devops-mcp-bridge-token-2024'
    }
  }
});

// Create API client instance
const apiClient = new DefaultApi(config);

/**
 * Demo: Get MCP Self Status
 */
async function getMCPStatus() {
  try {
    console.log('\n=== MCP Self Status ===');
    const response = await apiClient.apiMcpSelfStatusGet();
    console.log('Schema Version:', response.data.schema_version);
    console.log('Service:', response.data.service);
    console.log('Version:', response.data.version);
    return response.data;
  } catch (error) {
    console.error('Error fetching MCP status:', error.message);
  }
}

/**
 * Demo: Get Telemetry Info
 */
async function getTelemetryInfo() {
  try {
    console.log('\n=== Telemetry Info ===');
    const response = await apiClient.apiTelemetryInfoGet();
    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching telemetry info:', error.message);
  }
}

/**
 * Demo: List Projects
 */
async function listProjects() {
  try {
    console.log('\n=== Projects List ===');
    const response = await apiClient.apiProjectsGet();
    console.log('Projects:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error listing projects:', error.message);
  }
}

/**
 * Demo: Get Project Integration
 */
async function getProjectIntegration(projectId: string) {
  try {
    console.log(`\n=== Project Integration (${projectId}) ===`);
    const response = await apiClient.apiProjectsIdGet(projectId);
    console.log('Schema Version:', response.data.schema_version);
    console.log('Ready State:', response.data.summary?.ready);
    console.log('Path:', response.data.summary?.path);
    return response.data;
  } catch (error) {
    console.error('Error fetching project integration:', error.message);
  }
}

/**
 * Demo: Service Discovery
 */
async function getServiceDiscovery() {
  try {
    console.log('\n=== Service Discovery ===');
    const response = await apiClient.apiDiscoveryServicesGet();
    console.log('MCP URL:', response.data.mcp?.url);
    console.log('MCP OpenAPI:', response.data.mcp?.openapi);
    console.log('DS URL:', response.data.ds?.url);
    return response.data;
  } catch (error) {
    console.error('Error fetching service discovery:', error.message);
  }
}

/**
 * Demo: Schema Discovery
 */
async function getSchemaDiscovery() {
  try {
    console.log('\n=== Schema Discovery ===');
    const response = await apiClient.apiDiscoverySchemasGet();
    console.log('Available schemas:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching schema discovery:', error.message);
  }
}

/**
 * Demo: Validate Observations
 */
async function validateObservations() {
  try {
    console.log('\n=== Observations Validation ===');
    const response = await apiClient.apiToolsObsValidatePost();
    console.log('Validation OK:', response.data.ok);
    console.log('Telemetry Reachable:', response.data.telemetry?.reachable);
    console.log('Registry Path:', response.data.registry?.path);
    console.log('Registry Exists:', response.data.registry?.exists);
    return response.data;
  } catch (error) {
    console.error('Error validating observations:', error.message);
  }
}

/**
 * Main demo function
 */
async function main() {
  console.log('====================================');
  console.log('MCP TypeScript Client Demo');
  console.log('====================================');

  // Run demos in sequence
  await getMCPStatus();
  await getTelemetryInfo();
  await listProjects();
  await getProjectIntegration('test-project');
  await getServiceDiscovery();
  await getSchemaDiscovery();
  await validateObservations();

  console.log('\n====================================');
  console.log('Demo Complete!');
  console.log('====================================');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export functions for use in other modules
export {
  getMCPStatus,
  getTelemetryInfo,
  listProjects,
  getProjectIntegration,
  getServiceDiscovery,
  getSchemaDiscovery,
  validateObservations,
  apiClient
};