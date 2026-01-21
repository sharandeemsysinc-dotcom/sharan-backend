export interface Staff {
    id: string;
    user_id: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    country_code: string | null;
    email: string;
    mobile: string;
    image_url: string | null;
    status: number;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
}


export class StaffModel implements Staff {
    id!: string;
    user_id!: string;
    first_name!: string | null;
    middle_name!: string | null;
    last_name!: string | null;
    country_code!: string | null;
    email!: string;
    mobile!: string;
    image_url!: string | null;
    status!: number;
    created_by!: string | null;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: Staff) {
        // if (!data.name) throw new Error("Name is required");
        if (!data.email) throw new Error("Email is required");
        if (!data.mobile) throw new Error("Mobile is required");

        Object.assign(this, data);
    }
}

//  status 0 - inactive, 1 - active 2 - deleted
