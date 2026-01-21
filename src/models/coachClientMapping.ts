// src/models/CoachesClientMapping.ts

export interface ICoachesClientMapping {
  id: string;
  client_id: string;
  assigned_by_admin_id?: string | null;
  assigned_by_staff_id?: string | null;
  assigned_coach_ids: any;       // JSON array (string[])
  client_history_id: string;
  primary_coach_id: string;
  reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class CoachesClientMapping implements ICoachesClientMapping {
  id!: string;
  client_id!: string;
  assigned_by_admin_id?: string | null;
  assigned_by_staff_id?: string | null;
  assigned_coach_ids!: any;
  client_history_id!: string;
  primary_coach_id!: string;
  reason?: string | null;
  created_at?: Date;
  updated_at?: Date;

  constructor(data: ICoachesClientMapping) {
    Object.assign(this, data);
  }
}
