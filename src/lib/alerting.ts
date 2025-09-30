import { getConfig } from '../config.js';
import { logAlertRouteResolved } from './logging/events.js';

export async function maybeAlert(event: Record<string, unknown> & { profile?: string; run_id?: string }) {
  try {
    const cfg = getConfig();
    if (!cfg.alerting?.enabled) return;
    let routeUrl = cfg.alerting?.webhook_url;
    let channel: string | undefined;
    const profile = event.profile;
    const map = (cfg as any).telemetry_profiles || {};
    if (profile && map[profile]) {
      channel = map[profile].channel || undefined;
      routeUrl = map[profile].webhook_url || routeUrl;
    }
    if (!routeUrl) { logAlertRouteResolved({ run_id: event.run_id, profile, channel, ok: false, reason: 'no_webhook' }); return; }
    await fetch(routeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
    logAlertRouteResolved({ run_id: event.run_id, profile, channel, webhookUrl: routeUrl, ok: true });
  } catch {}
}
