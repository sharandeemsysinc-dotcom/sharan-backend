// src/models/Role.ts
export interface IRole {
  id: number;
  name: string;
  description?: string;
  permissions?: any; // JSONB in PostgreSQL
  created_at?: Date;
}

export class Role implements IRole {
  id!: number;
  name!: string;
  description?: string;
  permissions?: any;
  created_at?: Date;

  constructor(data: IRole) {
    Object.assign(this, data);
  }
}
