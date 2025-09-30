/**
 * Standalone client test using fetch (no dependencies)
 * Tests the basic MCP bridge functionality
 */

const BASE_URL = 'http://127.0.0.1:4319';
const TOKEN = 'devops-mcp-bridge-token-2024';

async function makeRequest(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function testEndpoints() {
  console.log('====================================');
  console.log('MCP Client Test (Standalone)');
  console.log('====================================');

  try {
    // Test telemetry info
    console.log('\n=== Telemetry Info ===');
    const telemetry = await makeRequest('/api/telemetry-info');
    console.log('Service:', telemetry.service.name, telemetry.service.version);
    console.log('Enabled:', telemetry.enabled);
    console.log('Reachable:', telemetry.reachable);
    console.log('Contract Version:', telemetry.contractVersion);

    // Test projects
    console.log('\n=== Projects ===');
    const projects = await makeRequest('/api/projects');
    console.log('Total projects:', projects.total);
    console.log('Items:', projects.items.length);

    // Test OpenAPI spec
    console.log('\n=== OpenAPI Spec ===');
    const openapi = await fetch(`${BASE_URL}/openapi.yaml`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const spec = await openapi.text();
    const firstLine = spec.split('\n')[0];
    console.log('First line:', firstLine);

    console.log('\n====================================');
    console.log('All tests passed! ✅');
    console.log('====================================');

    return true;
  } catch (error) {
    console.error('Test failed:', error.message);
    return false;
  }
}

// Run if executed directly
if (require.main === module) {
  testEndpoints().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testEndpoints };