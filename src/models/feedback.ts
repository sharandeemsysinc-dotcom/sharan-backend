export enum statusEnum {
    ACTIVE = 1,
    INACTIVE = 0,
    DELETED = 2,
}

export enum overallExperience_Enum {
    EXCELLENT = 5,
    VERY_GOOD = 4,
    GOOD = 3,
    FAIR = 2,
    POOR = 1
}

export enum coachEffectiveness_Enum {
    EXTREMELY_EFFECTIVE = 5,
    VERY_EFFECTIVE = 4,
    MODERATELY_EFFECTIVE = 3,
    SLIGHTLY_EFFECTIVE = 2,
    NOT_EFFECTIVE = 1
}

export enum styleFitOverTime_Enum {
    EXCELLENT_FIT_THROUGHOUT = 4,
    GOOD_FIT_OVERALL = 3,
    MIXED_FIT = 2,
    NOT_A_FIT = 1
}

export enum coach_Comfort_Level_Enum {
    VeryComfortable = 4,
    Comfortable = 3,
    Neutral = 2,
    Uncomfortable = 1
}

export enum coach_Understanding_Enum {
    FullyUnderstood = 4,
    MostlyUnderstood = 3,
    SomewhatUnderstood = 2,
    NotReally = 1
}

export enum style_and_Approach_Enum {
    ExcellentFit = 4,
    GoodFit = 3,
    NotSureYet = 2,
    NotAFit = 1
}

export enum felt_Supported_Enum {
    YesCompletely = 4,
    Mostly = 3,
    Somewhat = 2,
    NotReally = 1
}

export enum like_to_proceed_Enum {
    VeryLikely = 4,
    Likely = 3,
    Unsure = 2,
    Unlikely = 1
}

export interface Feedback {
    id: string;
    appointment_id: string;
    coach_id: string;
    client_id: string;
    status: statusEnum;
    is_first_appointment: boolean;
    created_at: Date;
    updated_at: Date;
    coach_Comfort_Level?: coach_Comfort_Level_Enum;
    coach_Understanding?: coach_Understanding_Enum;
    style_and_Approach?: style_and_Approach_Enum;
    felt_Supported?: felt_Supported_Enum;
    like_to_proceed?: like_to_proceed_Enum;
    rating?: number;
    positive_or_negative_about_conversation?: string;
    move_Forward_Decision_Question?: string;
    overall_experience?: overallExperience_Enum;
    effectiveness?: coachEffectiveness_Enum;
    style_fit_over_time?: styleFitOverTime_Enum;
    coach_feedback?: string;
}

export class FeedbackModel implements Feedback {
    id!: string;
    appointment_id!: string;
    coach_id!: string;
    client_id!: string;
    status!: statusEnum;
    is_first_appointment!: boolean;
    created_at!: Date;
    updated_at!: Date;
    coach_Comfort_Level?: coach_Comfort_Level_Enum;
    coach_Understanding?: coach_Understanding_Enum;
    style_and_Approach?: style_and_Approach_Enum;
    felt_Supported?: felt_Supported_Enum;
    like_to_proceed?: like_to_proceed_Enum;
    positive_or_negative_about_conversation?: string;
    move_Forward_Decision_Question?: string;
    rating?: number;
    overall_experience?: overallExperience_Enum;
    effectiveness?: coachEffectiveness_Enum;
    style_fit_over_time?: styleFitOverTime_Enum;
    coach_feedback?: string;

    constructor(data: Feedback) {
        Object.assign(this, data);
    }
}
