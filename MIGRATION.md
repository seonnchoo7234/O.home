# Migration Guide: Upgrading to 2FA Support

This document outlines the changes and necessary steps for migrating from version `75d83e3` to the current version which introduces **Two-Factor Authentication (2FA)** using `SimpleWebAuthn`.

## Summary of Changes

### 1. Security Hardening: Challenge Management
- **Old Way**: The authentication challenge was passed as a `challengeId` through the client-side application state and request bodies.
- **New Way**: The challenge is now managed via an `HttpOnly` cookie, which is significantly more secure as it prevents client-side JavaScript from accessing or intercepting the challenge.

### 2. New Authentication Flow (2FA)
A new authentication step has been introduced for users who have 2FA enabled:
1.  **Credential Check**: `login()` now detects if 2FA is required and returns a `requires2FA` flag.
2.  **Challenge Retrieval**: The client automatically fetches WebAuthn options from the server via `/api/auth/get-challenge`.
3.  **WebAuthn Ceremony**: The client performs the biometric/security key interaction using `@simplewebauthn/browser`.
4.  **Verification**: The assertion is sent to `/api/auth/verify-2fa`, where the server retrieves the challenge from the `HttpOnly` cookie and validates it.

### 3. New API Endpoints
The following endpoints have been added to the backend:
- `GET /api/auth/get-challenge`: Generates and stores a new challenge in a server-side session/map.
- `POST /api/auth/verify-2fa`: Verifies the WebAuthn assertion.

---

## Migration Steps

### For Developers (Codebase Update)

1.  **Install New Dependencies**:
    The following packages are now required for the 2FA flow:
    ```bash
    npm install @simplewebauthn/browser @simplewebauthn/server
    ```

2.  **Update Environment Variables**:
    Ensure your production environment is running on **HTTPS**, as `HttpOnly` cookies with the `Secure` flag require a secure context to be sent by the browser.

3.  **Verify Backend Implementation**:
    If you have customized the `Backend` interface or `FirebaseBackend`, ensure you have implemented the `verify2FA` method as defined in the updated `src/lib/backend/types.ts`.

### For Administrators (User Management)

1.  **Enable 2FA**:
    Once the update is deployed, administrators can begin configuring 2FA for their accounts.
2.  **Session Invalidation**:
    Users currently logged in may need to re-authenticate to trigger the new 2FA flow if they have 2FA enabled on their accounts.

---

## Troubleshooting

- **"No challenge session found" Error**: This occurs if the `HttpOnly` cookie is missing or blocked. Ensure your browser is not blocking third-party cookies and that you are accessing the site via `https`.
- **CSRF Issues**: Since we use `SameSite=Strict` for the challenge cookie, ensure your production environment correctly handles cookie headers.
