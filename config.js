/**
 * Workshop MVP — Configuration
 */
export const WORKSHOP_CONFIG = {
  api_base: '/.netlify/functions',
  heartbeat_interval: 15000,
  nudge_poll_interval: 8000,
  debounce_save_ms: 1500,
  dashboard_password: 'workshop2026',

  // Real-time dashboard polling
  pulse_interval: 2000,           // Lightweight pulse check every 2s
  full_refresh_interval: 15000,   // Full room data fallback every 15s
  classify_interval: 12000,       // AI classification batch every 12s
  inactivity_check_interval: 30000,
};
