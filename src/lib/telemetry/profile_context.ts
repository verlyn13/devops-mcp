import type { Attributes } from '@opentelemetry/api';

export function getProfileAttributes(profile?: string, projectId?: string): Attributes {
  const attrs: Attributes = {};
  if (profile) {
    (attrs as Record<string,string>).profile = profile;
    const env = profile === 'local' ? 'development' : (profile.includes('prod') ? 'production' : 'staging');
    (attrs as Record<string,string>).environment = env;
    (attrs as Record<string,string>).tier = profile.includes('critical') ? 'tier-1' : 'tier-2';
  }
  if (projectId) (attrs as Record<string,string>).project_id = projectId;
  return attrs;
}
