import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.info("Seeding database started...");

  // --------------------------------
  // 1. Create Roles
  // --------------------------------
  await prisma.role.createMany({
    data: [
      { id: 1, name: "Admin" },
      { id: 2, name: "Staff" },
      { id: 3, name: "Coach" },
      { id: 4, name: "Client" },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Roles created");

  // --------------------------------
  // 2. Create Admin User
  // --------------------------------
  const adminPassword = await bcrypt.hash("Admin@123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "alefitt_admin@yopmail.com" },
    update: {},
    create: {
      email: "alefitt_admin@yopmail.com",
      user_name: "Super Admin",
      password_hash: adminPassword,
      role_id: 1,
    },
  });

  await prisma.admin.upsert({
    where: { user_id: adminUser.id },
    update: {},
    create: {
      user_id: adminUser.id,
    },
  });

  console.log("✅ Admin user ready");

  // --------------------------------
  // 3. Create Subscription Plan + Types ✅ (ACTIVE)
  // --------------------------------
  const existingPlan = await prisma.subscriptionPlan.findFirst({
    where: { plan_name: "Premium" },
  });

  if (!existingPlan) {
    await prisma.subscriptionPlan.create({
      data: {
        plan_name: "Premium",
        status: 1,
        plan_type: {
          create: [
            {
              id: randomUUID(),
              amount: 50,
              currency: 1,
              plan_type_name: "Monthly",
            },
            {
              id: randomUUID(),
              amount: 600,
              currency: 1,
              plan_type_name: "Annual",
            },
          ],
        },
      },
    });

    console.log("✅ Subscription plan created");
  } else {
    console.log("ℹ Subscription plan already exists");
  }

  // --------------------------------
  // 4. Create Staff User + Staff Profile ✅
  // --------------------------------
  console.log("Seeding Staff User...");

  const STAFF_EMAIL = "alefitt_staff@gmail.com";

  let staffUser = await prisma.user.findUnique({
    where: { email: STAFF_EMAIL },
  });

  if (!staffUser) {
    const hashedPassword = await bcrypt.hash("Staff@123", 10);

    staffUser = await prisma.user.create({
      data: {
        email: STAFF_EMAIL,
        user_name: "Alefitt Staff",
        password_hash: hashedPassword,
        role_id: 2,
      },
    });

    console.log("✅ Staff USER created");
  }

  const existingStaff = await prisma.staff.findUnique({
    where: { user_id: staffUser.id },
  });

  if (!existingStaff) {
    await prisma.staff.create({
      data: {
        user_id: staffUser.id,
        first_name: "Alefitt Staff",
        email: STAFF_EMAIL,
        mobile: "8888888888",
        image_url: null,
        status: 1,
        created_by: adminUser.id,
      },
    });

    console.log("✅ Staff profile created");
  } else {
    console.log("ℹ Staff already exists");
  }

  // --------------------------------
  // 5. Create Client User + Client + ClientHistory ✅
  // --------------------------------
  console.log("Seeding Client...");

  const CLIENT_EMAIL = "alefitt_client@yopmail.com";

  let clientUser = await prisma.user.findUnique({
    where: { email: CLIENT_EMAIL },
  });

  if (!clientUser) {
    const hashedPassword = await bcrypt.hash("Client@123", 10);

    clientUser = await prisma.user.create({
      data: {
        email: CLIENT_EMAIL,
        user_name: "Alefitt Client",
        password_hash: hashedPassword,
        role_id: 4,
      },
    });

    console.log("✅ Client USER created");
  }

  const existingClient = await prisma.client.findUnique({
    where: { email: CLIENT_EMAIL },
  });

  if (!existingClient) {
    const client = await prisma.client.create({
      data: {
        user_id: clientUser.id,
        first_name: "Alefitt",
        last_name: "Client",
        middle_name: null,
        email: CLIENT_EMAIL,
        country_code: "+91",
        mobile: "9999999999",
        city: "Chennai",
        total_sessions: 0,
        status: 1,
        notes: "Seeded test client",
        linked_in_url: "https://linkedin.com",
        website_url: "https://alefitt.com",
      },
    });

    console.log("✅ Client created:", client.email);

    await prisma.clientHistory.create({
      data: {
        client_id: client.id,

        current_role: "Founder",
        support_seek: "Business Scaling",

        coaching_goals: {
          primary: "Leadership",
          secondary: "Team Management",
        },

        coaching_time: "Weekly",
        coaching_style: ["Direct", "Goal-Oriented"],

        not_working_coach_style: "Too aggressive",

        industries: ["IT", "Coaching"],
        other_industries: "Healthcare",

        is_worked_with_coach: 1,

        work_reason: "Business Growth",
        coach_reason: "Leadership Improvement",

        coach_area: ["Leadership", "Strategy"],
        other_area: "Mindset",

        working_style: 2,
        motivation_history: 3,

        coach_comments: "Highly motivated client",

        time_zone: "Asia/Kolkata",

        engagement_type: 1,
        ref_source: "LinkedIn",

        coach_experience: "New",
        coach_cred_preference: 1,

        coaching_credentials: ["ICF", "PCC"],
        other_coaching_credentials: "MBA",

        range_per_session: ["0-100", "100-1000"]
      },
    });



    console.log("✅ ClientHistory created");
  } else {
    console.log("ℹ Client already exists");
  }

  // --------------------------------
  // 6. Create Coach User + Coach Profile
  // --------------------------------
  console.log("Seeding Coach...");

  const COACH_EMAIL = "alefitt_coach@yopmail.com";
  let coachUser = await prisma.user.findUnique({ where: { email: COACH_EMAIL } });

  if (!coachUser) {
    const hashedPassword = await bcrypt.hash("Coach@123", 10);
    coachUser = await prisma.user.create({
      data: {
        email: COACH_EMAIL,
        user_name: "Alefitt Coach",
        password_hash: hashedPassword,
        role_id: 3,
      },
    });
    console.log("✅ Coach USER created");
  }

  let coach = await prisma.coach.findUnique({ where: { user_id: coachUser.id } });

  if (!coach) {
    coach = await prisma.coach.create({
      data: {
        user_id: coachUser.id,
        first_name: "John",
        last_name: "Doe",
        email: COACH_EMAIL,
        mobile: "8887776666",
        linked_url: "https://linkedin.com/in/johndoe",
        website: "https://johndoe.com",
        timezone: "Asia/Kolkata",
        coaching_hours: 500,
        coaching_experience: "5+ years",
        industries: ["IT", "Finance"],
        leadership_levels: ["C-Suite", "Manager"],
        coaching_style: ["Directive", "Supportive"],
        coaching_strength: "Leadership Development",
        preferred_client: "Executives",
        clients_situation: ["Career Transition", "Role Change"],
        session_rates: { "60min": 150 },
        is_approved: 1,
        status: 1,
        coaching_credentials: ["ICF-PCC"],
        terms_conditions: true
      },
    });
    console.log("✅ Coach profile created");
  } else {
    console.log("ℹ Coach already exists");
  }

  // ensure we have the client object for linking
  const clientForLink = await prisma.client.findUnique({ where: { email: CLIENT_EMAIL } });

  if (clientForLink && coach) {
    // --------------------------------
    // 7. Create Appointment
    // --------------------------------
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        client_id: clientForLink.id,
        coach_id: coach.id
      }
    });

    if (!existingAppointment) {
      await prisma.appointment.create({
        data: {
          client_id: clientForLink.id,
          coach_id: coach.id,
          start_date: new Date(),
          end_date: new Date(),
          scheduled_start: new Date(new Date().setDate(new Date().getDate() - 2)), // 2 days ago
          scheduled_end: new Date(new Date().setDate(new Date().getDate() - 2)),
          duration_minutes: 60,
          timezone: "Asia/Kolkata",
          status: 1, // Completed
          meeting_link: "https://meet.google.com/abc-defg-hij",
          currency: "USD"
        }
      });
      console.log("✅ Appointment created");
    }

    // --------------------------------
    // 8. Create Coach Request (with rejection)
    // --------------------------------
    // Create a request where this coach was rejected
    const existingRequest = await prisma.coachRequest.findFirst({
      where: { email: CLIENT_EMAIL }
    });

    if (!existingRequest) {
      await prisma.coachRequest.create({
        data: {
          client_id: clientForLink.id,
          user_id: clientForLink.user_id,
          email: CLIENT_EMAIL,
          name: `${clientForLink.first_name} ${clientForLink.last_name}`,
          phone: clientForLink.mobile ?? " ",
          reason: "Looking for a new coach",
          coaches: [
            {
              coach_id: coach.id,
              reason: "Timezone mismatch",
            }
          ]
        }
      });
      console.log("✅ Coach Request (rejected) created");
    }
  }

  console.info("✅✅✅ FULL SEED COMPLETED SUCCESSFULLY");
}

main()
  .catch((e) => {
    console.error("❌ Seed Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
