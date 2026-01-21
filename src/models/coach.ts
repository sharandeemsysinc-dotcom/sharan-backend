export interface Coach {
    id: string;
    user_id: string;

    first_name: string;
    middle_name: string | null;
    last_name: string | null;

    email: string;
    mobile?: string | null;
    linked_url: string;
    website?: string | null;

    country_code?: string | null;
    terms_conditions?: boolean | null;

    image_url: string | null;
    upload_file_url: string | null;

    timezone: string;

    coaching_credentials: any[] | null;
    other_coaching_credentials: string | null;

    acc_upload_file: string | null;
    pcc_upload_file: string | null;
    mcc_upload_file: string | null;
    emcc_upload_file: string | null;
    co_active_upload_file: string | null;
    other_upload_file: string | null;

    coaching_hours: number;
    coaching_experience: string | null;

    industries: any[] | null;
    other_industries: string | null;

    leadership_levels: any[] | null;

    coaching_topics: any[] | null;
    coaching_style: any[] | null;

    other_coaching_style: string | null;

    coaching_philosophy: string | null;
    coaching_strength: string;
    preferred_client: string;

    clients_situation: any[] | null;
    other_clients_situation: string | null;

    coaching_boundaries: string | null;
    connecting_coaches: number | null;
    connecting_other_coaches?: string | null;
    anything?: string | null;
    bio? : string | null;

    session_rates: any[] | null;

    is_static: number;
    comments: string | null;

    status: number;
    is_approved: number;

    approved_by?: string | null;
    approved_by_staff?: string | null;
    approved_at?: Date | null;
    rejection_reason?: string | null;

    current_payment_method_id?: string | null;
    current_subscription_id?: string | null;
    current_subscription_type_id?: string | null;

    stripe_payment_intent_id?: string | null;
    stripe_customer_id?: string | null;

    rating_average?: number | null;
    total_sessions?: number | null;
    total_reviews?: number | null;
    rating?: number | null;

    created_at: Date;
    updated_at: Date;
}


export class coachModel implements Coach {
    id!: string;
    user_id!: string;

    first_name!: string;
    middle_name!: string | null;
    last_name!: string | null;

    email!: string;
    mobile?: string | null;
    linked_url!: string;
    website?: string | null;

    country_code?: string | null;
    terms_conditions?: boolean | null;

    image_url!: string | null;
    upload_file_url!: string | null;

    timezone!: string;

    coaching_credentials!: any[] | null;
    other_coaching_credentials!: string | null;

    acc_upload_file!: string | null;
    pcc_upload_file!: string | null;
    mcc_upload_file!: string | null;
    emcc_upload_file!: string | null;
    co_active_upload_file!: string | null;
    other_upload_file!: string | null;

    coaching_hours!: number;
    coaching_experience!: string | null;

    industries!: any[] | null;
    other_industries!: string | null;

    leadership_levels!: any[] | null;

    coaching_topics!: any[] | null;
    coaching_style!: any[] | null;
    other_coaching_style!: string | null;

    coaching_philosophy!: string | null;
    coaching_strength!: string;
    preferred_client!: string;

    clients_situation!: any[] | null;
    other_clients_situation!: string | null;

    coaching_boundaries!: string | null;
    connecting_coaches!: number | null;
    connecting_other_coaches?: string | null;
    anything?: string | null;
    bio? : string | null;

    session_rates!: any[] | null;
    is_static!: number;
    comments!: string | null;

    status!: number;
    is_approved!: number;

    approved_by?: string | null;
    approved_by_staff?: string | null;
    approved_at?: Date | null;
    rejection_reason?: string | null;

    current_payment_method_id?: string | null;
    current_subscription_id?: string | null;
    current_subscription_type_id?: string | null;

    stripe_payment_intent_id?: string | null;
    stripe_customer_id?: string | null;

    rating_average?: number | null;
    total_sessions?: number | null;
    total_reviews?: number | null;
    rating?: number | null;

    created_at!: Date;
    updated_at!: Date;

    constructor(data: Coach) {
        Object.assign(this, data);
    }
}