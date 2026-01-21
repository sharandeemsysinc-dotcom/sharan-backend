export enum isDeletedEnum {
    ACTIVE = 0,
    DELETED = 1
}

export interface holiday {
    id?: string;
    coachId: string;
    holidayDate: Date;
    reason: string;
    isDeleted: isDeletedEnum;
    created_at: Date;
    updated_at: Date;
}

export class holidayModel implements holiday {
    id?: string;
    coachId!: string;
    holidayDate!: Date;
    reason!: string;
    isDeleted!: isDeletedEnum;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: holiday) {
        Object.assign(this, data);
    }
}