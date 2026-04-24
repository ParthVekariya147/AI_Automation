import { AuditLogModel } from "../models/AuditLog.js";

export async function createAuditLog(payload: {
  actorUserId?: string;
  businessId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await AuditLogModel.create(payload);
}
