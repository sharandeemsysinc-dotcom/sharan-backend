import { Request, Response } from "express";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { CoachRequestModel } from "../models/coachRequest";
const component = "Coach Request Controller";

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    return [error, undefined];
  }
}

// Request a New Coach
export const coachRequest = async (req: Request, res: Response) => {
  try {
    const { client_id, user_id, email, name, phone, reason, coaches } = req.body;

    const coachRequest = await prisma.coachRequest.create({
      data: {
        client_id,
        user_id,
        email,
        name,
        phone,
        reason,
        coaches
      },
    });

    return res.status(201).json({
      status: true,
      message: "Coach Requested successfully",
      data: coachRequest,
    });
  } catch (error: any) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// Get All Client Requests
export const getAllCoachRequests = async (req: Request, res: Response) => {
  try {
    const page = Number(req.body.page ?? 0);
    const itemPerPage = Number(req.body.itemPerPage ?? 0);
    const search = req.body.search ?? "";
    const noPagination = !page || !itemPerPage;
    const noSearch = !search || search.trim() === "";
    const where: any = {};
    if (!noSearch) {   // Search Fields
      const OR: any[] = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
      ];

      where.OR = OR;
    }
    let [countErr, totalCount] = await handle(prisma.coachRequest.count({ where }));
    if (countErr) {
      return errorResponse(res, 500, "Failed to count coach records");
    }
    // QUERY
    const query: any = {
      where,
      orderBy: { created_at: "desc" },
    };
    if (!noPagination) {
      const skip = (page - 1) * itemPerPage;
      query.skip = skip;
      query.take = itemPerPage;
    }
    // FETCH DATA
    let [err, items] = await handle(prisma.coachRequest.findMany(query));
    if (err)
      return errorResponse(res, 500, "Failed to fetch coach records");
    if (!items || items.length === 0) {
      if (!items || items.length === 0) {
        return res.status(200).json({
          status: true,
          statusCode: 200,
          data: [],
          message: "No records found"
        });
      }
    }
    return successResponse(res, 200, "Get all coach successfully", {
      totalCount,
      items,
    });
  } catch (error: any) {
    logger.error({ component }, error.message);
    return errorResponse(res, 500, error.message);
  }
};

// Get Coach Request By ID
async function getCoachRequestbyId(req: Request, res: Response) {
  logger.info({ component }, "Get Coach Request By ID");

  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, "ID is required");
    }
    const [err, coachRequest] = await handle(
      prisma.coachRequest.findUnique({
        where: { id }
      })
    );

    if (err) {
      return errorResponse(res, 500, "Failed to fetch coach request data");
    }

    if (!coachRequest) {
      return errorResponse(res, 404, "Coach request not found");
    }

    let clientPreferences = {
      industries: null as any,
      other_industries: null as string | null,
      range_per_session: null as any,
      time_zone: null as string | null
    };

    if (coachRequest.client_id) {
      const [historyErr, history] = await handle(
        prisma.clientHistory.findFirst({
          where: {
            client_id: coachRequest.client_id
          },
          orderBy: {
            created_at: "desc"
          },
          select: {
            industries: true,
            other_industries: true,
            range_per_session: true,
            time_zone: true
          }
        })
      );

      if (!historyErr && history) {
        clientPreferences = history;
      }
    }
    return successResponse(
      res,
      200,
      "Get coach request by ID successfully",
      {
        coachRequest: new CoachRequestModel(coachRequest),
        client_preferences: clientPreferences
      }
    );

  } catch (error: any) {
    logger.error({ component }, error.message);
    return errorResponse(res, 500, error.message);
  }
}

// Get Rejected Clients for a Coach
export const getRejectedClients = async (req: Request, res: Response) => {
  try {
    const { coach_id } = req.body;
    if (!coach_id) return errorResponse(res, 400, "Coach ID is required");

    const coachDetails = await prisma.coach.findUnique({
      where: { id: String(coach_id) },
      select: { first_name: true, middle_name: true, last_name: true }
    });

    // Pagination and search parameters
    const page = Number(req.body.page ?? 0);
    const itemPerPage = Number(req.body.itemPerPage ?? 0);
    const search = req.body.search ?? "";
    const noPagination = !page || !itemPerPage;
    const noSearch = !search || search.trim() === "";

    // 1. Fetch all coach requests
    const allRequests = await prisma.coachRequest.findMany({
      select: {
        id: true,
        client_id: true,
        coaches: true,
        created_at: true
      }
    });

    const rejectedContexts: any[] = [];

    // 2. Filter requests where this coach was rejected
    for (const request of allRequests) {
      const coachesList = request.coaches as any;
      if (Array.isArray(coachesList)) {
        // Find the entry for this coach
        // match by coach_id (most likely) or id
        const match = coachesList.find((c: any) =>
          c.coach_id === coach_id || c.id === coach_id || c.coach === coach_id
        );

        // Check if rejected (has reason)
        if (match && match.reason) {
          rejectedContexts.push({
            client_id: request.client_id,
            reason: match.reason,
            appointment_date: match.appointment_date,
            request_date: request.created_at
          });
        }
      }
    }

    if (rejectedContexts.length === 0) {
      return successResponse(res, 200, "No rejected clients found", {
        totalCount: 0,
        items: []
      });
    }

    // 3. Fetch Client details and Appointments
    const results = await Promise.all(rejectedContexts.map(async (ctx) => {
      // Fetch Client
      const client = await prisma.client.findUnique({
        where: { id: ctx.client_id }
      });

      // Handle Profile Image URL
      if (client && client.profile_image) {
        client.profile_image = `${process.env.S3StorageLinkForimages}web/clients/${client.profile_image}`;
      }

      // Fetch Appointments between this coach and client
      const appointments = await prisma.appointment.findMany({
        where: {
          coach_id: coach_id,
          client_id: ctx.client_id
        },
        orderBy: {
          scheduled_start: 'desc'
        }
      });

      // Get the latest appointment
      const appointment = appointments.length > 0 ? appointments[0] : null;

      return {
        clientDetails: client,
        rejected_reason: ctx.reason,
        appointment: appointment
      };
    }));

    // 4. Apply search filter
    let filteredResults = results;
    if (!noSearch) {
      const searchLower = search.toLowerCase();
      filteredResults = results.filter((item) => {
        const client = item.clientDetails;
        if (!client) return false;

        const nameMatch = client.first_name?.toLowerCase().includes(searchLower) ||
          client.last_name?.toLowerCase().includes(searchLower);
        const emailMatch = client.email?.toLowerCase().includes(searchLower);
        const phoneMatch = client.mobile?.toLowerCase().includes(searchLower);

        return nameMatch || emailMatch || phoneMatch;
      });
    }

    const totalCount = filteredResults.length;

    // 5. Apply pagination
    let paginatedResults = filteredResults;
    if (!noPagination) {
      const skip = (page - 1) * itemPerPage;
      paginatedResults = filteredResults.slice(skip, skip + itemPerPage);
    }

    return successResponse(res, 200, "Rejected clients fetched successfully", {
      totalCount,
      coach_details: {
        first_name: coachDetails?.first_name || null,
        middle_name: coachDetails?.middle_name || null,
        last_name: coachDetails?.last_name || null
      },
      items: paginatedResults
    });

  } catch (error: any) {
    logger.error({ component }, error.message);
    return errorResponse(res, 500, error.message);
  }
};

export default {
  coachRequest,
  getAllCoachRequests,
  getCoachRequestbyId,
  getRejectedClients
};
