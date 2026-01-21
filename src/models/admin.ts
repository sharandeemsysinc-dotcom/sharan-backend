export interface Admin {
    id: string;
    user_id: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    country_code: string | null;
    email: string | null;
    mobile: string | null;
    image_url: string | null;
    access_level: string;
    status: number;
    created_by: string | null;
    created_at: Date;
    updated_at: Date | null;
}


export class AdminModel implements Admin {
    id!: string;
    user_id!: string;
    first_name!: string | null;
    middle_name!: string | null;
    last_name!: string | null;
    country_code!: string | null;
    email!: string | null;
    mobile!: string | null;
    image_url!: string | null;
    access_level!: string;
    status!: number;
    created_by!: string | null;
    created_at!: Date;
    updated_at!: Date | null;

    constructor(data: Admin) {
        Object.assign(this, data);
    }
}

// status 0 - inactive, 1 - active, 2 - deleted
