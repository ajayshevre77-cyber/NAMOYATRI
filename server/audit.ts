import { AuditEventRecord } from './types';
import { MOCK_AUDIT_LOGS } from '../src/data/kumbhData';

// Secure append-only server audit log state
// In production with Firebase Admin credentials, also mirrored to Firestore /auditLogs
const serverAuditStore: AuditEventRecord[] = [
  ...MOCK_AUDIT_LOGS.map(log => ({
    id: log.id,
    timestamp: new Date().toISOString(),
    actorId: log.actorId,
    actorRole: log.actorRole.toUpperCase(),
    action: log.action,
    details: log.details,
    ipAddressMasked: log.ipAddressMasked,
    severity: (log.action.includes('SOS') || log.action.includes('FRAUD') ? 'WARNING' : 'INFO') as 'INFO' | 'WARNING' | 'CRITICAL',
  }))
];

export function maskIp(ip?: string): string {
  if (!ip) return '127.0.0.••';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.••.••`;
  }
  return ip.substring(0, Math.min(ip.length, 8)) + '••';
}

export function recordAuditEvent(params: {
  actorId: string;
  actorRole: string;
  action: string;
  details: string;
  targetId?: string;
  ipAddress?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}): AuditEventRecord {
  const record: AuditEventRecord = {
    id: 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    actorId: params.actorId || 'ANONYMOUS',
    actorRole: (params.actorRole || 'UNKNOWN').toUpperCase(),
    action: params.action,
    targetId: params.targetId,
    details: params.details,
    ipAddressMasked: maskIp(params.ipAddress),
    severity: params.severity || 'INFO',
  };

  // Append-only: user mutations or deletions are disallowed
  serverAuditStore.unshift(record);

  // Keep a bounded in-memory ceiling of 1000 latest events
  if (serverAuditStore.length > 1000) {
    serverAuditStore.pop();
  }

  return record;
}

export function getAuditLogs(limitCount = 100): AuditEventRecord[] {
  // Return shallow copies to prevent reference tampering
  return serverAuditStore.slice(0, limitCount).map(r => ({ ...r }));
}
