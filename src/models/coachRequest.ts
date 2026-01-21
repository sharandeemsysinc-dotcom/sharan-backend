export interface CoachRequest {
    id: string;
    client_id: string;
    user_id: string;
    name: string | null;     // nullable
    email?: string;
    phone: string | null;    // nullable
    reason: string | null;   // nullable
    coaches: any;
    created_at: Date;
    updated_at: Date;
}

export class CoachRequestModel implements CoachRequest {
    id!: string;
    client_id!: string;
    user_id!: string;
    name!: string | null;
    email?: string;
    phone!: string | null;
    reason!: string | null;
    coaches!: any;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: CoachRequest) {
        Object.assign(this, data);
    }
}