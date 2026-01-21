"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var client_1 = require("@prisma/client");
var bcryptjs_1 = require("bcryptjs");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var adminPassword, adminUser, adminEntry, staffPassword, staffUser;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.info("Seeding database...");
                    // --------------------------------
                    // 1. Create Roles (IDs 1–4)
                    // --------------------------------
                    return [4 /*yield*/, prisma.role.createMany({
                            data: [
                                { id: 1, name: "Admin" },
                                { id: 2, name: "Staff" },
                                { id: 3, name: "Coach" },
                                { id: 4, name: "Client" },
                            ],
                            skipDuplicates: true
                        })];
                case 1:
                    // --------------------------------
                    // 1. Create Roles (IDs 1–4)
                    // --------------------------------
                    _a.sent();
                    console.info("Roles created");
                    return [4 /*yield*/, bcryptjs_1["default"].hash("Admin@123", 10)];
                case 2:
                    adminPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: "admin@example.com",
                                user_name: "Super Admin",
                                password_hash: adminPassword,
                                role_id: 1
                            }
                        })];
                case 3:
                    adminUser = _a.sent();
                    return [4 /*yield*/, prisma.admin.create({
                            data: {
                                user_id: adminUser.id
                            }
                        })];
                case 4:
                    adminEntry = _a.sent();
                    console.info("Admin user created:", adminUser.email);
                    return [4 /*yield*/, bcryptjs_1["default"].hash("Staff@123", 10)];
                case 5:
                    staffPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: "staff@example.com",
                                user_name: "Test Staff",
                                password_hash: staffPassword,
                                role_id: 2
                            }
                        })];
                case 6:
                    staffUser = _a.sent();
                    // Create staff entry
                    return [4 /*yield*/, prisma.staff.create({
                            data: {
                                user_id: staffUser.id,
                                name: "Test Staff",
                                email: "staff@example.com",
                                mobile: "9876543210",
                                image_url: null,
                                created_by: adminEntry.id,
                                status: 1
                            }
                        })];
                case 7:
                    // Create staff entry
                    _a.sent();
                    console.info("Staff user created:", staffUser.email);
                    // --------------------------------
                    // 4. Create Subscription Plans
                    // --------------------------------
                    return [4 /*yield*/, prisma.subscriptionPlan.createMany({
                            data: [
                                {
                                    name: "Basic Plan",
                                    description: "For small usage",
                                    amount: 19.99,
                                    currency: 0,
                                    status: 1
                                },
                                {
                                    name: "Pro Plan",
                                    description: "For professionals",
                                    amount: 49.99,
                                    currency: 0,
                                    status: 1
                                },
                                {
                                    name: "Enterprise",
                                    description: "Unlimited clients",
                                    amount: 199.99,
                                    currency: 1,
                                    status: 1
                                },
                            ],
                            skipDuplicates: true
                        })];
                case 8:
                    // --------------------------------
                    // 4. Create Subscription Plans
                    // --------------------------------
                    _a.sent();
                    console.info("✔ Subscription plans created");
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .then(function () { return console.info("Seeding completed"); })["catch"](function (e) { return console.error("Seed error:", e); })["finally"](function () { return prisma.$disconnect(); });
