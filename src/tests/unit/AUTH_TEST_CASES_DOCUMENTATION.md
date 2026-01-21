# Auth Routes Test Cases Documentation

## Overview
This document outlines all test cases for the authentication routes in the Alfitt backend application using Vitest.

## Test File Location
- **Comprehensive Tests**: `src/tests/unit/auth.routes.comprehensive.test.ts`
- **Original Tests**: `src/tests/unit/auth.routes.test.ts`

---

## Test Categories

### 1. Route Existence Tests (6 tests)
Verify that all authentication endpoints are properly registered and accessible.

| Test Case | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| TC-001 | `/auth/login` | POST | Verify login endpoint exists |
| TC-002 | `/auth/google` | GET | Verify Google OAuth endpoint exists |
| TC-003 | `/auth/callback` | POST | Verify OAuth callback endpoint exists |
| TC-004 | `/auth/change_password` | POST | Verify password change endpoint exists |
| TC-005 | `/auth/forgot_password` | POST | Verify forgot password endpoint exists |
| TC-006 | `/auth/reset_password` | GET | Verify reset password endpoint exists |

**Expected Results**: All endpoints should return status code other than 404.

---

### 2. HTTP Method Validation Tests (4 tests)
Ensure routes only accept their designated HTTP methods.

| Test Case | Endpoint | Invalid Method | Expected Result |
|-----------|----------|----------------|-----------------|
| TC-007 | `/auth/login` | GET | 404 Not Found |
| TC-008 | `/auth/google` | POST | 404 Not Found |
| TC-009 | `/auth/callback` | GET | 404 Not Found |
| TC-010 | `/auth/reset_password` | POST | 404 Not Found |

**Purpose**: Prevent unauthorized access through incorrect HTTP methods.

---

### 3. Login Endpoint Tests (6 tests)

#### TC-011: Successful Login
- **Input**: Valid email and password
- **Expected**: 
  - Status: 200
  - Response contains: `token`, `user` object
  - `success: true`

#### TC-012: Missing Email
- **Input**: Password only
- **Expected**: 
  - Status: 400
  - Error message: "Email and password are required"

#### TC-013: Missing Password
- **Input**: Email only
- **Expected**: 
  - Status: 400
  - Error message: "Email and password are required"

#### TC-014: Invalid Credentials
- **Input**: `invalid@test.com` with any password
- **Expected**: 
  - Status: 401
  - Error message: "Invalid credentials"

#### TC-015: Empty Request Body
- **Input**: `{}`
- **Expected**: 
  - Status: 400
  - `success: false`

#### TC-016: Malformed JSON
- **Input**: Invalid JSON string
- **Expected**: Status >= 400

---

### 4. Google Login Tests (2 tests)

#### TC-017: Google OAuth Redirect
- **Expected**: 
  - Status: 302 (Redirect)
  - Response contains `redirectUrl`

#### TC-018: Public Access
- **Expected**: No authentication required (status not 401/403)

---

### 5. OAuth Callback Tests (3 tests)

#### TC-019: Valid Callback
- **Input**: Valid authorization code
- **Expected**: 
  - Status: 200
  - Response contains `token` and `user`

#### TC-020: Missing Authorization Code
- **Input**: Empty body
- **Expected**: 
  - Status: 400
  - Error message about required code

#### TC-021: Additional Parameters
- **Input**: Code with state and scope
- **Expected**: Status: 200 (should handle gracefully)

---

### 6. Change Password Tests (5 tests)

#### TC-022: Successful Password Change
- **Input**: Valid old and new passwords (new >= 8 chars)
- **Expected**: 
  - Status: 200
  - Success message

#### TC-023: Missing Old Password
- **Input**: New password only
- **Expected**: Status: 400

#### TC-024: Missing New Password
- **Input**: Old password only
- **Expected**: Status: 400

#### TC-025: Weak Password
- **Input**: New password < 8 characters
- **Expected**: 
  - Status: 400
  - Error message: "Password must be at least 8 characters"

#### TC-026: Empty Request
- **Input**: `{}`
- **Expected**: Status: 400

---

### 7. Forgot Password Tests (4 tests)

#### TC-027: Valid Email
- **Input**: Valid email address
- **Expected**: 
  - Status: 200
  - Message: "Password reset email sent"

#### TC-028: Missing Email
- **Input**: Empty body
- **Expected**: Status: 400

#### TC-029: Empty Email String
- **Input**: `{ email: "" }`
- **Expected**: Status: 400

#### TC-030: Security - Email Enumeration Prevention
- **Input**: Non-existent email
- **Expected**: Status: 200 (same as valid email - security best practice)

---

### 8. Reset Password Tests (4 tests)

#### TC-031: Valid Reset
- **Input**: Valid token and new password
- **Expected**: 
  - Status: 200
  - Success message

#### TC-032: Missing Token
- **Input**: New password only
- **Expected**: Status: 400

#### TC-033: Missing New Password
- **Input**: Token only
- **Expected**: Status: 400

#### TC-034: No Query Parameters
- **Input**: Empty query string
- **Expected**: Status: 400

---

### 9. Performance Tests (3 tests)

#### TC-035: Login Response Time ⚡
- **Requirement**: Login must complete in < 3 seconds
- **Test**: Measure time from request to response
- **Expected**: Response time < 3000ms

#### TC-036: Concurrent Requests
- **Test**: 5 simultaneous login requests
- **Expected**: All requests succeed with status 200

#### TC-037: Forgot Password Performance
- **Test**: Measure forgot password response time
- **Expected**: Response time < 2000ms

---

### 10. Security Tests (4 tests)

#### TC-038: Error Message Safety
- **Test**: Check error messages don't expose sensitive info
- **Expected**: No database, SQL, or stack trace information

#### TC-039: SQL Injection Protection
- **Input**: `admin'--` and `' OR '1'='1`
- **Expected**: Request handled safely (status >= 400)

#### TC-040: XSS Protection
- **Input**: `<script>alert('xss')</script>` in email
- **Expected**: Request rejected or sanitized

#### TC-041: User Enumeration Prevention
- **Test**: Compare responses for existing vs non-existing emails
- **Expected**: Same status code for both

---

### 11. Edge Cases (5 tests)

#### TC-042: Extremely Long Email
- **Input**: 1000+ character email
- **Expected**: Status >= 400

#### TC-043: Special Characters in Password
- **Input**: Password with `!@#$%^&*()`
- **Expected**: Request processed normally

#### TC-044: Unicode Characters
- **Input**: Chinese/Japanese characters
- **Expected**: Request processed (may succeed or fail based on validation)

#### TC-045: Null Values
- **Input**: `{ email: null, password: null }`
- **Expected**: Status: 400

#### TC-046: Undefined Values
- **Input**: `{ email: undefined, password: undefined }`
- **Expected**: Status: 400

---

### 12. Content-Type Tests (2 tests)

#### TC-047: JSON Content-Type
- **Header**: `Content-Type: application/json`
- **Expected**: Status: 200 (accepted)

#### TC-048: Missing Content-Type
- **Header**: None
- **Expected**: Request still processed with default

---

### 13. Controller Invocation Tests (6 tests)

Verify that each route calls its corresponding controller exactly once.

| Test Case | Endpoint | Controller Method |
|-----------|----------|-------------------|
| TC-049 | `/auth/login` | `emailPasswordLogin` |
| TC-050 | `/auth/google` | `redirectToGoogleLogin` |
| TC-051 | `/auth/callback` | `cognitoCallback` |
| TC-052 | `/auth/change_password` | `updatePassword` |
| TC-053 | `/auth/forgot_password` | `forgotPassword` |
| TC-054 | `/auth/reset_password` | `resetPassword` |

**Verification**: Each controller should be called exactly once per request.

---

## Test Execution

### Run All Tests
```bash
npm test auth.routes.comprehensive.test.ts
```

### Run Specific Test Suite
```bash
npm test -- --grep "Login Endpoint Tests"
```

### Run with Coverage
```bash
npm test -- --coverage auth.routes.comprehensive.test.ts
```

### Watch Mode
```bash
npm test -- --watch auth.routes.comprehensive.test.ts
```

---

## Test Statistics

- **Total Test Cases**: 54+
- **Test Categories**: 13
- **Endpoints Covered**: 6
- **Performance Tests**: 3
- **Security Tests**: 4
- **Edge Cases**: 5

---

## Mock Strategy

The test suite uses Vitest mocking to:

1. **Mock Auth Controller**: All controller methods are mocked with realistic responses
2. **Simulate Validation**: Mocks include validation logic for comprehensive testing
3. **Error Scenarios**: Mocks return appropriate error codes and messages
4. **Isolated Testing**: Routes are tested independently of actual business logic

---

## Key Testing Principles

### ✅ Positive Testing
- Valid inputs with expected successful outcomes
- Proper data flow through the system

### ❌ Negative Testing
- Invalid inputs and edge cases
- Missing required fields
- Malformed requests

### 🔒 Security Testing
- SQL injection attempts
- XSS prevention
- Information disclosure prevention
- User enumeration protection

### ⚡ Performance Testing
- Response time requirements
- Concurrent request handling
- Load behavior

### 🎯 Boundary Testing
- Minimum/maximum values
- Empty and null values
- Special characters

---

## Best Practices Implemented

1. **Isolation**: Each test is independent with `beforeEach` cleanup
2. **Clarity**: Descriptive test names following "should..." pattern
3. **Coverage**: Multiple test categories for comprehensive coverage
4. **Assertions**: Multiple assertions per test where appropriate
5. **Mocking**: Proper use of mocks to isolate route logic
6. **Performance**: Actual timing measurements for critical paths
7. **Security**: Tests for common vulnerabilities

---

## Maintenance Notes

### When to Update Tests

- **New Route Added**: Add corresponding test cases
- **Route Modified**: Update affected test cases
- **Validation Changed**: Update validation test expectations
- **Security Requirements**: Add new security test cases

### Test Failure Investigation

1. Check if route definition changed
2. Verify controller mock is properly configured
3. Review request/response format changes
4. Check for middleware additions

---

## Integration with CI/CD

These tests should be:
- ✅ Run on every commit
- ✅ Required to pass before merge
- ✅ Included in coverage reports
- ✅ Part of pre-deployment checks

---

## Related Documentation

- [Auth Controller Tests](../integration/auth.test.ts)
- [Coach Routes Tests](./coach.routes.test.ts)
- [API Documentation](../../docs/api.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-28 | Initial comprehensive test suite |

---

## Contact

For questions about these tests, contact the backend development team.
