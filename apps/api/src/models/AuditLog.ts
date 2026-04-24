import { Schema, model } from "mongoose";

export interface AuditLogEntity {
  actorUserId?: Schema.Types.ObjectId;
  businessId?: Schema.Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const auditLogSchema = new Schema<AuditLogEntity>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", index: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const AuditLogModel = model<AuditLogEntity>("AuditLog", auditLogSchema);
