export enum StatusEnum {
    INACTIVE = 0,
    ACTIVE = 1,
    DELETED = 2
}

export interface Client {
    id: string;
    user_id: string;
    first_name: string;
    last_name?: string | null;
    middle_name?: string | null;
    email: string;
    country_code?: string | null;
    mobile?: string | null;
    city?: string | null;
    total_sessions: number;
    status: StatusEnum;
    notes?: string | null;
    profile_image?: string | null;
    linked_in_url?: string | null;
    website_url?: string | null;
    terms_conditions?: boolean | null;
    created_at: Date;
    updated_at: Date;
}

export class ClientModel implements Client {
    id!: string;
    user_id!: string;
    first_name!: string;
    last_name?: string | null;
    middle_name?: string | null;
    email!: string;
    country_code?: string | null;
    mobile?: string | null;
    city?: string | null;
    total_sessions!: number;
    status!: StatusEnum;
    notes?: string | null;
    profile_image?: string | null;
    linked_in_url?: string | null;
    website_url?: string | null;
    terms_conditions?: boolean | null;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: Client) {
        Object.assign(this, data);
    }
}
