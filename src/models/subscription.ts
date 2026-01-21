export class SubscriptionModel {
    id!: string;
    plan_name!: string;
    plan_type!: any[];
    status!: number;
    created_at!: Date;
    updated_at!: Date;
}


export class SubscriptionPlanModel {
    id!: string;
    plan_name!: string;
    plan_type!: any[];
    status!: number;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: any) {
        if (!data.plan_name) {
            throw new Error("plan_name is required");
        }

        if (!Array.isArray(data.plan_type) || data.plan_type.length === 0) {
            throw new Error("plan_type must be a non-empty array");
        }

        // Optional: validation for each plan_type entry
        data.plan_type.forEach((p: any) => {
            if (!p.plan_type_name) throw new Error("plan_type_name is required");
            if (p.amount === undefined || p.amount === null)
                throw new Error("amount is required inside plan_type");
            if (p.currency === undefined || p.currency === null)
                throw new Error("currency is required inside plan_type");
        });

        Object.assign(this, data);
    }
}


// status 0- inactive ,1- inactive, 2-deleted
// Currency 0 - INR , 1-USD