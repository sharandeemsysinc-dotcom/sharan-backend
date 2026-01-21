export interface ClientHistory {
    id: string;
    client_id: string;
    current_role?: string | null;
    support_seek?: string | null;
    coaching_goals?: any;                  // Json
    other_coaching_goals?: string | null;
    coaching_time?: string | null;
    coaching_style?: any;                  // Json
    other_coaching_style?: string | null;
    not_working_coach_style?: string | null;
    leadership_levels?: any;
    other_leadership_levels?: string | null;
    coach_experience_in_industry?: number | null; // 0 | 1 | 2
    industries?: any;                      // Json
    other_industries?: string | null;
    is_worked_with_coach?: number | null;  // 0 | 1
    work_reason?: string | null;
    coach_reason?: string | null;
    coach_area?: any;                      // Json
    other_area?: string | null;
    working_style?: number | null;         // 0,1,2,3
    motivation_history?: number | null;    // 0,1,2,3
    coach_comments?: string | null;
    time_zone?: string | null;
    other_time_zone?: string | null;
    engagement_type?: number | null;       // 0,1,2
    other_engagement_type?: string | null;
    ref_source?: string | null;
    coach_experience?: string | null;      // 0,1,2,3
    coach_cred_preference?: number | null; // 0,1
    coaching_credentials?: any;            // Json
    other_coaching_credentials?: string | null;
    acc_upload_file?: string | null;
    pcc_upload_file?: string | null;
    mcc_upload_file?: string | null;
    emcc_upload_file?: string | null;
    cpcc_upload_file?: string | null;
    other_upload_file?: string | null;
    notes?: string | null;
    range_per_session?: any;               // Json
    created_at: Date;
    updated_at: Date;
}

export class ClientHistoryModel implements ClientHistory {
    id!: string;
    client_id!: string;
    current_role?: string | null;
    support_seek?: string | null;
    coaching_goals?: any;                  // Json
    other_coaching_goals?: string | null;
    coaching_time?: string | null;
    coaching_style?: any;                  // Json
    other_coaching_style?: string | null;
    not_working_coach_style?: string | null;
    leadership_levels?: any[] | null;
    other_leadership_levels?: string | null;
    coach_experience_in_industry?: number | null; // 0 | 1 | 2
    industries?: any;                      // Json
    other_industries?: string | null;
    is_worked_with_coach?: number | null;  // 0 | 1
    work_reason?: string | null;
    coach_reason?: string | null;
    coach_area?: any;                      // Json
    other_area?: string | null;
    working_style?: number | null;         // 0,1,2,3
    motivation_history?: number | null;    // 0,1,2,3
    coach_comments?: string | null;
    time_zone?: string | null;
    other_time_zone?: string | null;
    engagement_type?: number | null;       // 0,1,2
    other_engagement_type?: string | null;
    ref_source?: string | null;
    coach_experience?: string | null;      // 0,1,2,3
    coach_cred_preference?: number | null; // 0,1
    coaching_credentials?: any;            // Json
    other_coaching_credentials?: string | null;
    acc_upload_file?: string | null;
    pcc_upload_file?: string | null;
    mcc_upload_file?: string | null;
    emcc_upload_file?: string | null;
    cpcc_upload_file?: string | null;
    other_upload_file?: string | null;
    range_per_session?: any;               // Json
    notes?: string | null;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: ClientHistory) {
        Object.assign(this, data);
    }
}