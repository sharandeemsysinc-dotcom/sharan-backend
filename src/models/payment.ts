export interface Payments {
    id: string;

    coach_id: string;                     // FK → Coach

    payment_type: string;                 // e.g. initial_registration, renewal

    related_subscription_id?: string | null;

    stripe_customer_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_charge_id?: string | null;

    amount: number;                     
    currency: string;                     // "usd"

    is_paid: number;                      // 0 = pending, 1 = paid
    status: number;                       // 0 = pending, 1 = success, 2 = failed

    failure_reason?: string | null;
    payment_method?: string | null;

    created_at: Date;
    updated_at: Date;
}

export class PaymentsModel implements Payments {
    id!: string;

    coach_id!: string;

    payment_type!: string;

    related_subscription_id?: string | null;

    stripe_customer_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_charge_id?: string | null;

    amount!: number;
    currency!: string;

    is_paid!: number;
    status!: number;

    failure_reason?: string | null;
    payment_method?: string | null;

    created_at!: Date;
    updated_at!: Date;

    constructor(data: Payments) {
        Object.assign(this, data);
    }
}

