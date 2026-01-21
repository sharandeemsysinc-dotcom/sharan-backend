import { Request, Response } from "express";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { randomUUID } from "crypto";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { SubscriptionPlanModel } from "../models/subscription";

const component = "SubscriptionPlan Controller";

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
};

// Create Subscription Plan
async function createSubscriptionPlan(req: Request, res: Response) {
    logger.info({ component }, "Create Subscription Plan", req.body);

    try {
        const { plan_name, plan_type } = req.body;

        // Basic validation
        if (!plan_name) {
            return errorResponse(res, 400, "plan_name is required");
        }

        if (!Array.isArray(plan_type) || plan_type.length === 0) {
            return errorResponse(res, 400, "plan_type must be a non-empty array");
        }

        const formattedPlanType = plan_type.map((item: any) => ({
            id: randomUUID(),
            plan_type_name: item.plan_type_name,
            amount: item.amount,
            currency: item.currency
        }));

        // Create subscription plan
        const [err, created] = await handle(
            prisma.subscriptionPlan.create({
                data: {
                    plan_name,
                    plan_type: formattedPlanType,  // JSON directly saved in PostgreSQL
                    status: 1
                }
            })
        );

        if (err) return errorResponse(res, 500, "Failed to create subscription plan");
        return successResponse(
            res,
            200,
            "Subscription plan created successfully",
            new SubscriptionPlanModel(created)
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
};

//Get All Subscription Plans
async function getAllSubscription(req: Request, res: Response) {
    logger.info({ component }, "Get All Subscription Plans (pagination)");

    try {
        const page = Number(req.body.page ?? 0);
        const itemPerPage = Number(req.body.itemPerPage ?? 0);
        const search = req.body.search ?? "";

        const noPagination = !page || !itemPerPage;
        const noSearch = !search || search.trim() === "";

        const where: any = { status: { not: 2 } }; // hide soft-deleted rows

        if (!noSearch) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ];
        }

        const [countErr, totalCount] = await handle(
            prisma.subscriptionPlan.count({ where })
        );

        if (countErr) return errorResponse(res, 500, "Failed to count subscription plans");

        const query: any = {
            where,
            orderBy: { created_at: "desc" }
        };

        if (!noPagination) {
            const skip = (page - 1) * itemPerPage;
            query.skip = skip;
            query.take = itemPerPage;
        }

        const [err, items] = await handle(
            prisma.subscriptionPlan.findMany(query)
        );

        if (err) return errorResponse(res, 500, "Failed to fetch subscription plans");

        return successResponse(res, 200, "Subscription plans fetched successfully", {
            totalCount,
            items
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
};

//Get Subscription Plan By ID
async function getSubscriptionPlanById(req: Request, res: Response) {
    logger.info({ component }, "Get Subscription Plan By ID");

    try {
        const id = req.params.id;

        if (!id) {
            return errorResponse(res, 400, "ID is required");
        }

        const [err, plan] = await handle(
            prisma.subscriptionPlan.findUnique({ where: { id } })
        );

        if (err) return errorResponse(res, 500, "Failed to fetch subscription plan");
        if (!plan) return errorResponse(res, 404, "Subscription plan not found");

        return successResponse(
            res,
            200,
            "Subscription plan fetched successfully",
            new SubscriptionPlanModel(plan)
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
};

// Update Subscription Plan
async function updateSubscriptionPlan(req: Request, res: Response) {
    logger.info({ component }, "Update Subscription Plan", req.body);

    try {
        const { id } = req.params;
        const { plan_name, plan_type } = req.body;

        if (!id) {
            return errorResponse(res, 400, "Subscription Plan ID is required");
        }

        // Check if plan exists
        const existingPlan = await prisma.subscriptionPlan.findUnique({
            where: { id }
        });

        if (!existingPlan) {
            return errorResponse(res, 404, "Subscription plan not found");
        }
        const updateData: any = {};

        if (plan_name !== undefined) {
            if (!plan_name.trim()) {
                return errorResponse(res, 400, "plan_name cannot be empty");
            }
            updateData.plan_name = plan_name;
        }

        if (plan_type !== undefined) {

            if (!Array.isArray(plan_type) || plan_type.length === 0) {
                return errorResponse(res, 400, "plan_type must be a non-empty array");
            }

            // For update → assign UUID only to NEW plan types
            const formattedPlanType = plan_type.map((item: any) => ({
                id: item.id ?? randomUUID(), // keep existing UUID, generate new if missing
                plan_type_name: item.plan_type_name,
                amount: item.amount,
                currency: item.currency
            }));

            updateData.plan_type = formattedPlanType;
        }

        const [err, updated] = await handle(
            prisma.subscriptionPlan.update({
                where: { id },
                data: updateData
            })
        );

        if (err) {
            return errorResponse(res, 500, "Failed to update subscription plan");
        }

        return successResponse(
            res,
            200,
            "Subscription plan updated successfully",
            updated
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Delete Subscription Plan 
async function deleteSubscriptionPlan(req: Request, res: Response) {
    logger.info({ component }, "Delete Subscription Plan");

    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Subscription Plan ID is required");
        }
        const [err, deleted] = await handle(
            prisma.subscriptionPlan.update({
                where: { id: id },
                data: { status: 2 }
            })
        );
        if (err) return errorResponse(res, 500, "Failed to delete subscription plan");
        if (!deleted) return errorResponse(res, 404, "Subscription plan not found");
        return successResponse(res, 200, "Subscription plan deleted successfully");

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
};

//Enable or Disable Subscription Plan
async function enableDisableSubscription(req: Request, res: Response) {
    logger.info({ component }, "Toggle Subscription Plan Status");
    try {
        const id = req.params.id;
        const { status } = req.body;

        if (!id) return errorResponse(res, 400, "Plan ID is required");
        if (![0, 1].includes(Number(status))) {
            return errorResponse(res, 400, "Invalid status, must be 0 or 1");
        }
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
        if (!plan) return errorResponse(res, 404, "Subscription plan not found");
        await prisma.subscriptionPlan.update({
            where: { id },
            data: { status: Number(status) }
        });
        return successResponse(
            res,
            200,
            `Subscription plan ${status == 1 ? "enabled" : "disabled"} successfully`,
            { id, status: Number(status) }
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
};

export default {
    createSubscriptionPlan,
    getAllSubscription,
    getSubscriptionPlanById,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    enableDisableSubscription
};

