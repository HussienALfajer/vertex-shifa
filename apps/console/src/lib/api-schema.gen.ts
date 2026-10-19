// Generated from apps/api/openapi.json by test/api-schema.test.ts; never edit by hand.
export interface paths {
    "/api/.well-known/jwks.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["JwksController.jwks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AccessController.catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["TenancyLookupController.areas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/areas/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["TenancyLookupController.area"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/otp/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.requestOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/otp/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.resendOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/otp/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.verifyOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.setPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/pow": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.proofOfWork"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/registration-options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AuthController.registrationOptions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController.signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/accounts/{id}/password-reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAccountsController.authorizePasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/accounts/{id}/phone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["ConsoleAccountsController.changePhone"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/accounts/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAccountsController.lookUp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/auth/reauth": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAuthController.reauthenticate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/auth/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAuthController.setUp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAuthController.signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/auth/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAuthController.signOut"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/auth/totp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConsoleAuthController.totp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ConsoleMeController.me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["ConsoleMeController.changePassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/platform-users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PlatformUsersController.list"];
        put?: never;
        post: operations["PlatformUsersController.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/platform-users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["PlatformUsersController.update"];
        trace?: never;
    };
    "/api/console/platform-users/{id}/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PlatformUsersController.reset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/tenants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["TenancyConsoleController.list"];
        put?: never;
        post: operations["TenancyConsoleController.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/tenants/{id}/directory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["TenancyConsoleController.setDirectory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/console/tenants/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["TenancyConsoleController.changeStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DeviceManagementController.list"];
        put?: never;
        post: operations["DevicesController.register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DeviceManagementController.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["DeviceManagementController.rename"];
        trace?: never;
    };
    "/api/devices/{id}/enrollments/{enrollmentId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DeviceManagementController.removeMember"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DeviceManagementController.revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DevicesController.current"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/current/enrollments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DevicesController.enroll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/current/wiped": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DevicesController.wiped"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DevicesController.token"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/devices/token/challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DevicesController.challenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/facilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FacilitiesController.list"];
        put?: never;
        post: operations["FacilitiesController.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/facilities/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FacilitiesController.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["FacilitiesController.update"];
        trace?: never;
    };
    "/api/facilities/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["FacilitiesController.archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/facilities/{id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["FacilitiesController.restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["HealthCheckController.check"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/maps/resolve-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["TenancyLookupController.resolveMapLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["MeController.me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["MeController.changePassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/practitioners": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PractitionersController.list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/practitioners/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PractitionersController.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["PractitionersController.update"];
        trace?: never;
    };
    "/api/practitioners/{id}/photo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PractitionersController.getPhoto"];
        put: operations["PractitionersController.replacePhoto"];
        post?: never;
        delete: operations["PractitionersController.archivePhoto"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SessionsController.open"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sessions/challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SessionsController.challenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sessions/current/end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SessionsController.end"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sessions/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SessionsController.refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/specialties": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SpecialtiesController.list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StaffController.list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StaffController.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["StaffController.changeAccess"];
        trace?: never;
    };
    "/api/staff/{id}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.deactivate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/invitation/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/invitation/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.resend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/password-reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.authorizePasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/previous-practitioner": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StaffController.previousPractitioner"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/{id}/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.reactivate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/staff/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StaffController.invite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tenant": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["TenantController.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tenant/logo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["TenantController.getLogo"];
        put: operations["TenantController.replaceLogo"];
        post?: never;
        delete: operations["TenantController.archiveLogo"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tenant/onboarding/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["TenantController.completeOnboarding"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tenant/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["TenantController.updateProfile"];
        trace?: never;
    };
    "/api/tenant/security": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["TenantController.updateSecurity"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AccessCatalog: {
            permissions: {
                key: components["schemas"]["PermissionKey"];
                /** @enum {string} */
                group: "clinic" | "staff" | "devices" | "practitioners";
                branchScoped: boolean;
                limit: "any" | components["schemas"]["StaffRole"][];
            }[];
            presets: {
                [key: string]: components["schemas"]["PermissionKey"][];
            };
            ownerLocked: components["schemas"]["PermissionKey"][];
        };
        AccountName: string;
        AccountPasswordResetAuthorized: {
            /** Format: uuid */
            accountId: string;
            /** Format: date-time */
            passwordResetAuthorizedUntil: string;
        };
        Area: {
            /** Format: uuid */
            id: string;
            parentId: string | null;
            level: components["schemas"]["AreaLevel"];
            nameAr: string;
            nameLatin: string;
            archivedAt: string | null;
        };
        /** @enum {string} */
        AreaLevel: "governorate" | "city";
        AreaList: components["schemas"]["Area"][];
        /** @enum {string} */
        AuditAction: "tenant.created" | "tenant.status_changed" | "tenant.directory_listing_changed" | "tenant.profile_updated" | "tenant.onboarding_completed" | "tenant_logo.replaced" | "tenant_logo.archived" | "facility.created" | "facility.updated" | "facility.archived" | "facility.restored" | "tenant.security_updated" | "staff.invited" | "staff.invitation_resent" | "staff.invitation_cancelled" | "staff.invitation_accepted" | "staff.access_changed" | "staff.deactivated" | "staff.reactivated" | "staff.password_reset_authorized" | "device.registered" | "device.renamed" | "device.revoked" | "device.wiped" | "device_enrollment.created" | "device_enrollment.revoked" | "staff_session.started" | "practitioner.created" | "practitioner.updated" | "practitioner.archived" | "practitioner.restored" | "practitioner_photo.replaced" | "practitioner_photo.archived" | "account.created" | "account.password_set" | "account.password_reset_authorized" | "account.phone_changed" | "account.looked_up" | "account.sign_in_locked" | "console.request" | "platform_user.created" | "platform_user.role_changed" | "platform_user.disabled" | "platform_user.enabled" | "platform_user.reset" | "platform_user.setup_completed" | "platform_user.signed_in" | "platform_user.sign_in_failed" | "platform_user.sign_in_locked" | "platform_user.totp_failed" | "platform_user.recovery_code_used" | "platform_user.reauthenticated" | "platform_user.password_changed" | "platform_user.signed_out";
        /** @enum {string} */
        AuditActorKind: "staff" | "patient" | "platform" | "system";
        AuthorizeAccountPasswordReset: {
            reason: string;
        };
        BranchScope: {
            /** @constant */
            allFacilities: true;
        } | {
            /** @constant */
            allFacilities: false;
            facilityIds: string[];
        };
        ChangeAccountPhone: {
            phone: components["schemas"]["MobilePhoneNumber"];
            reason: string;
        };
        ChangePassword: {
            currentPassword: string;
            newPassword: components["schemas"]["Password"];
        };
        ChangeStaffAccess: {
            roles: components["schemas"]["StaffRole"][];
            branchScope: components["schemas"]["BranchScope"];
            /**
             * @default {
             *       "granted": [],
             *       "revoked": []
             *     }
             */
            adjustments: components["schemas"]["PermissionAdjustments"];
            practitioner?: components["schemas"]["PractitionerProfileInput"];
            /** Format: date-time */
            expectedUpdatedAt: string;
        };
        ChangeTenantStatus: {
            /** @enum {string} */
            status: "active" | "suspended" | "closed";
            /** @default other */
            reasonCategory: components["schemas"]["TenantStatusReason"];
            reason: string;
        };
        /** @enum {string} */
        ClinicalReadScope: "branch" | "own_patients";
        ConsoleAccount: {
            /** Format: uuid */
            id: string;
            phone: string;
            nameAr: string | null;
            hasPassword: boolean;
            passwordResetAuthorizedUntil: string | null;
            signInLockedUntil: string | null;
            memberships: {
                /** Format: uuid */
                tenantId: string;
                tenantNameAr: string;
                tenantStatus: components["schemas"]["TenantStatus"];
                /** Format: uuid */
                membershipId: string;
                status: components["schemas"]["MembershipStatus"];
                roles: components["schemas"]["StaffRole"][];
            }[];
        };
        ConsoleAccountLookup: {
            phone: components["schemas"]["MobilePhoneNumber"];
        };
        ConsoleMe: {
            /** Format: uuid */
            id: string;
            phone: string;
            name: string;
            role: components["schemas"]["PlatformRole"];
            permissions: ("tenants.read" | "tenants.create" | "tenants.change-status" | "tenants.manage-directory" | "accounts.recover" | "platform-users.manage")[];
            recoveryCodesRemaining: number;
            session: {
                /** Format: date-time */
                expiresAt: string;
                reauthenticatedUntil: string | null;
            };
        };
        ConsoleReauth: {
            code: components["schemas"]["TotpCode"];
        };
        ConsoleReauthenticated: {
            /** Format: date-time */
            reauthenticatedUntil: string;
        };
        ConsoleSetup: {
            ticket: string;
            password: components["schemas"]["Password"];
            code: components["schemas"]["TotpCode"];
        };
        ConsoleSetUp: {
            /** Format: uuid */
            id: string;
            phone: string;
            name: string;
            role: components["schemas"]["PlatformRole"];
            permissions: ("tenants.read" | "tenants.create" | "tenants.change-status" | "tenants.manage-directory" | "accounts.recover" | "platform-users.manage")[];
            recoveryCodesRemaining: number;
            session: {
                /** Format: date-time */
                expiresAt: string;
                reauthenticatedUntil: string | null;
            };
            recoveryCodes: string[];
        };
        ConsoleSignIn: {
            phone: components["schemas"]["MobilePhoneNumber"];
            password?: string;
            setupCode?: components["schemas"]["SetupCode"];
            proofOfWork: components["schemas"]["ProofOfWorkSolution"];
        };
        ConsoleSignInResult: {
            /** @constant */
            step: "totp";
            ticket: string;
        } | {
            /** @constant */
            step: "setup";
            ticket: string;
            totpSecret: string;
            totpUri: string;
        };
        ConsoleTotp: {
            ticket: string;
            code: components["schemas"]["TotpCode"] | components["schemas"]["RecoveryCode"];
        };
        ContactPhone: {
            phone: components["schemas"]["PhoneNumber"];
            whatsapp: boolean;
        };
        Coordinates: {
            latitudeE7: number;
            longitudeE7: number;
        };
        CreateFacility: {
            name: string;
            /** Format: uuid */
            areaId: string;
            addressDetails: string;
            coordinates: components["schemas"]["Coordinates"];
            contactPhones: components["schemas"]["ContactPhone"][];
            defaultCurrency: components["schemas"]["CurrencyCode"];
            /** @default 63 */
            workingDays: components["schemas"]["WorkingDays"];
            /** @default ticket_only */
            displayNameFormat: components["schemas"]["DisplayNameFormat"];
            /** @default true */
            displayCallSound: boolean;
        };
        CreateInvitation: {
            phone: components["schemas"]["MobilePhoneNumber"];
            name: string;
            roles: components["schemas"]["StaffRole"][];
            branchScope: components["schemas"]["BranchScope"];
            /**
             * @default {
             *       "granted": [],
             *       "revoked": []
             *     }
             */
            adjustments: components["schemas"]["PermissionAdjustments"];
            practitioner?: components["schemas"]["PractitionerProfileInput"];
        };
        CreatePlatformUser: {
            phone: components["schemas"]["MobilePhoneNumber"];
            name: string;
            role: components["schemas"]["PlatformRole"];
        };
        CreateTenant: {
            nameAr: string;
            nameLatin?: string;
            reason: string;
        };
        /** @enum {string} */
        CurrencyCode: "USD" | "TRY" | "SYP";
        CurrentDevice: {
            device: components["schemas"]["DeviceRegistration"];
            tenant: {
                /** Format: uuid */
                id: string;
                nameAr: string;
                nameLatin: string | null;
                status: components["schemas"]["TenantStatus"];
                idleLockMinutes: components["schemas"]["IdleLockMinutes"];
            };
            facility: {
                /** Format: uuid */
                id: string;
                name: string;
            } | null;
            members: {
                /** Format: uuid */
                enrollmentId: string;
                /** Format: uuid */
                membershipId: string;
                name: string;
                roles: components["schemas"]["StaffRole"][];
                /** Format: date-time */
                lastConfirmedAt: string;
            }[];
        };
        DeactivateStaff: {
            reason: string;
        };
        DeviceEnrollment: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            deviceId: string;
            /** Format: uuid */
            membershipId: string;
            /** Format: date-time */
            lastConfirmedAt: string;
        };
        DeviceName: string;
        DeviceRegistration: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            tenantId: string;
            facilityId: string | null;
            name: string;
            status: components["schemas"]["DeviceStatus"];
        };
        /** @enum {string} */
        DeviceRevokeCategory: "lost_or_stolen" | "replaced" | "other";
        /** @enum {string} */
        DeviceStatus: "active" | "revoked";
        DeviceToken: {
            deviceToken: string;
            /** Format: date-time */
            expiresAt: string;
        };
        DeviceTokenChallenge: {
            /** Format: uuid */
            tenantId: string;
            /** Format: uuid */
            deviceId: string;
        };
        DeviceTokenRequest: {
            /** Format: uuid */
            tenantId: string;
            /** Format: uuid */
            deviceId: string;
            nonce: string;
            signature: components["schemas"]["Signature"];
            appVersion: string;
        };
        DeviceWiped: {
            wipedAt: string | null;
        };
        /** @enum {string} */
        DisplayNameFormat: "ticket_only" | "first_name_father_initial";
        EndSession: {
            /** @enum {string} */
            reason: "signed_out" | "locked";
        };
        Enroll: {
            userPublicKey: components["schemas"]["PublicKey"];
        };
        Enrolled: {
            enrollment: components["schemas"]["DeviceEnrollment"];
            session: components["schemas"]["SessionTokens"];
        };
        /** @enum {string} */
        EnrollmentRevokeReason: "device_revoked" | "member_deactivated" | "removed_from_device" | "pin_forgotten" | "branch_left";
        /** @enum {string} */
        ErrorCode: "VALIDATION_FAILED" | "POW_INVALID" | "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "TICKET_INVALID" | "SESSION_ENDED" | "SIGNATURE_INVALID" | "DEVICE_UNKNOWN" | "FORBIDDEN" | "DEVICE_REVOKED" | "ENROLLMENT_REVOKED" | "MEMBERSHIP_INACTIVE" | "BRANCH_NOT_IN_SCOPE" | "REAUTH_REQUIRED" | "NOT_ENTITLED" | "TENANT_SUSPENDED" | "TENANT_CLOSED" | "NOT_FOUND" | "CONFLICT" | "INVALID_STATUS_TRANSITION" | "LAST_ACTIVE_FACILITY" | "ALREADY_MEMBER" | "LAST_OWNER" | "LAST_ADMIN" | "FACILITY_HAS_DEVICES" | "CURRENCY_MISMATCH" | "INVALID_AMOUNT" | "ONBOARDING_INCOMPLETE" | "FILE_REJECTED" | "MAP_LINK_UNRECOGNIZED" | "OTP_INVALID" | "OTP_EXPIRED" | "PASSWORD_TOO_WEAK" | "TOTP_INVALID" | "PERMISSION_NOT_GRANTABLE" | "RATE_LIMITED" | "OTP_ATTEMPTS_EXCEEDED" | "OTP_COOLDOWN" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE" | "OTP_DELIVERY_UNAVAILABLE";
        ErrorResponse: {
            code: components["schemas"]["ErrorCode"];
            message: string;
        };
        ExchangeRate: {
            from: components["schemas"]["CurrencyCode"];
            to: components["schemas"]["CurrencyCode"];
            rate: string;
        };
        Facility: {
            /** Format: uuid */
            id: string;
            /** @constant */
            type: "clinic";
            name: string;
            /** Format: uuid */
            areaId: string;
            addressDetails: string;
            coordinates: components["schemas"]["Coordinates"];
            contactPhones: components["schemas"]["ContactPhone"][];
            defaultCurrency: components["schemas"]["CurrencyCode"];
            workingDays: components["schemas"]["WorkingDays"];
            displayNameFormat: components["schemas"]["DisplayNameFormat"];
            displayCallSound: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            archivedAt: string | null;
        };
        FacilityPage: {
            items: components["schemas"]["Facility"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** @enum {string} */
        Gender: "male" | "female";
        HealthCheck: {
            /** @constant */
            status: "ok";
            /** @constant */
            database: "ok";
        };
        IdleLockMinutes: number;
        /** @enum {string} */
        InvitationMessageStatus: "pending" | "sent" | "failed";
        Jwks: {
            keys: {
                /** @constant */
                kty: "OKP";
                /** @constant */
                crv: "Ed25519";
                x: string;
                kid: string;
                /** @constant */
                alg: "EdDSA";
                /** @constant */
                use: "sig";
            }[];
        };
        ListAreasQuery: {
            /** Format: uuid */
            parentId?: string;
        };
        ListDevicesQuery: {
            status?: components["schemas"]["DeviceStatus"];
        };
        ListFacilitiesQuery: {
            /** @default false */
            archived: boolean;
            /**
             * @default createdAt
             * @enum {string}
             */
            sort: "createdAt" | "name";
            /**
             * @default asc
             * @enum {string}
             */
            order: "asc" | "desc";
            /** @default 1 */
            page: number;
            /** @default 50 */
            pageSize: number;
        };
        ListStaffQuery: {
            status?: components["schemas"]["MembershipStatus"];
            /** @default 1 */
            page: number;
            /** @default 50 */
            pageSize: number;
        };
        ListTenantsQuery: {
            status?: components["schemas"]["TenantStatus"];
            /**
             * @default createdAt
             * @enum {string}
             */
            sort: "createdAt" | "nameAr" | "statusChangedAt";
            /**
             * @default asc
             * @enum {string}
             */
            order: "asc" | "desc";
            /** @default 1 */
            page: number;
            /** @default 50 */
            pageSize: number;
        };
        ManagedDevice: {
            /** Format: uuid */
            id: string;
            facilityId: string | null;
            name: string;
            status: components["schemas"]["DeviceStatus"];
            os: string;
            appVersion: string;
            /** Format: date-time */
            lastSeenAt: string;
            /** Format: date-time */
            registeredAt: string;
            revokedAt: string | null;
            wipedAt: string | null;
            /** Format: date-time */
            updatedAt: string;
            members: {
                /** Format: uuid */
                enrollmentId: string;
                /** Format: uuid */
                membershipId: string;
                name: string;
                roles: components["schemas"]["StaffRole"][];
                /** Format: date-time */
                lastConfirmedAt: string;
            }[];
        };
        ManagedDeviceList: components["schemas"]["ManagedDevice"][];
        Me: {
            account: {
                /** Format: uuid */
                id: string;
                phone: string;
                nameAr: string | null;
            };
            /** Format: uuid */
            tenantId: string;
            /** Format: uuid */
            membershipId: string;
            roles: components["schemas"]["StaffRole"][];
            allFacilities: boolean;
            facilityIds: string[];
            permissions: components["schemas"]["PermissionKey"][];
            /** Format: uuid */
            deviceId: string;
            facilityId: string | null;
            practitioner: components["schemas"]["Practitioner"] | null;
        };
        /** @enum {string} */
        MembershipStatus: "invited" | "active" | "deactivated";
        MobilePhoneNumber: components["schemas"]["PhoneNumber"];
        Money: {
            amount: number;
            currency: components["schemas"]["CurrencyCode"];
        };
        Nonce: {
            nonce: string;
            /** Format: date-time */
            expiresAt: string;
        };
        OpenSession: {
            /** Format: uuid */
            enrollmentId: string;
            nonce: string;
            signature: components["schemas"]["Signature"];
        };
        OtpChallenge: {
            /** Format: uuid */
            challengeId: string;
        };
        OtpCode: string;
        /** @enum {string} */
        OtpPurpose: "device_sign_in" | "first_sign_in" | "password_reset";
        OtpRequest: {
            phone: components["schemas"]["MobilePhoneNumber"];
            /** @enum {string} */
            purpose: "first_sign_in" | "password_reset";
            proofOfWork: components["schemas"]["ProofOfWorkSolution"];
        };
        OtpVerified: {
            ticket: string;
            needsPassword: boolean;
            needsName: boolean;
            suggestedName: string | null;
        };
        OtpVerify: {
            /** Format: uuid */
            challengeId: string;
            code: components["schemas"]["OtpCode"];
        };
        Password: string;
        PasswordChanged: {
            /** Format: date-time */
            passwordChangedAt: string;
        };
        PasswordResetAuthorized: {
            /** Format: date-time */
            passwordResetAuthorizedUntil: string;
        };
        PermissionAdjustments: {
            /** @default [] */
            granted: components["schemas"]["PermissionKey"][];
            /** @default [] */
            revoked: components["schemas"]["PermissionKey"][];
        };
        /** @enum {string} */
        PermissionKey: "tenant.read" | "tenant.manage" | "facility.manage" | "staff.read" | "staff.manage" | "devices.manage" | "practitioners.read" | "practitioner.edit_own";
        PhoneNumber: string;
        /** @enum {string} */
        PlatformRole: "admin" | "support";
        PlatformUser: {
            /** Format: uuid */
            id: string;
            phone: string;
            name: string;
            role: components["schemas"]["PlatformRole"];
            status: components["schemas"]["PlatformUserStatus"];
            setupCodeExpiresAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        PlatformUserList: components["schemas"]["PlatformUser"][];
        PlatformUserSetup: {
            user: components["schemas"]["PlatformUser"];
            setupCode: string;
            /** Format: date-time */
            setupCodeExpiresAt: string;
        };
        /** @enum {string} */
        PlatformUserStatus: "pending_setup" | "active" | "disabled";
        Practitioner: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            membershipId: string;
            displayNameAr: string;
            displayNameLatin: string | null;
            gender: components["schemas"]["Gender"];
            specialtyIds: string[];
            syndicateNumber: string | null;
            hasPhoto: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        PractitionerList: components["schemas"]["Practitioner"][];
        PractitionerPhoto: {
            /** @constant */
            contentType: "image/jpeg";
            /** Format: base64 */
            data: string;
            byteSize: number;
            width: number;
            height: number;
            sha256: string;
        };
        PractitionerProfileInput: {
            displayNameAr: string;
            /** @default null */
            displayNameLatin: string | null;
            gender: components["schemas"]["Gender"];
            specialtyIds: string[];
            /** @default null */
            syndicateNumber: string | null;
        };
        PreviousPractitioner: {
            practitioner: components["schemas"]["Practitioner"] | null;
            photo: components["schemas"]["PractitionerPhoto"] | null;
        };
        ProofOfWorkChallenge: {
            challenge: string;
            difficulty: number;
            /** Format: date-time */
            expiresAt: string;
        };
        ProofOfWorkSolution: {
            challenge: string;
            nonce: string;
        };
        PublicKey: string;
        RecoveryCode: string;
        RefreshSession: {
            refreshToken: string;
        };
        RegisterDevice: {
            /** Format: uuid */
            tenantId: string;
            facilityId: string | null;
            name: components["schemas"]["DeviceName"];
            publicKey: components["schemas"]["PublicKey"];
            os: string;
            appVersion: string;
            userPublicKey: components["schemas"]["PublicKey"];
        };
        RegisteredDevice: {
            device: components["schemas"]["DeviceRegistration"];
            enrollment: components["schemas"]["DeviceEnrollment"];
            session: components["schemas"]["SessionTokens"];
        };
        RegistrationOptions: {
            clinics: {
                /** Format: uuid */
                tenantId: string;
                nameAr: string;
                nameLatin: string | null;
                status: components["schemas"]["TenantStatus"];
                roles: components["schemas"]["StaffRole"][];
                branches: {
                    /** Format: uuid */
                    id: string;
                    name: string;
                }[];
            }[];
        };
        RenameDevice: {
            name: components["schemas"]["DeviceName"];
        };
        ResolveMapLink: {
            /** Format: uri */
            url: string;
        };
        RevokedEnrollment: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            deviceId: string;
            /** Format: uuid */
            membershipId: string;
            /** Format: date-time */
            revokedAt: string;
            revokeReason: components["schemas"]["EnrollmentRevokeReason"];
        };
        RevokeDevice: {
            category: components["schemas"]["DeviceRevokeCategory"];
            reason: string;
        };
        SessionEnded: {
            /** Format: date-time */
            endedAt: string;
        };
        /** @enum {string} */
        SessionEndReason: "signed_out" | "locked" | "expired" | "member_deactivated" | "device_revoked" | "enrollment_revoked" | "password_reset";
        SessionTokens: {
            /** Format: uuid */
            sessionId: string;
            accessToken: string;
            /** Format: date-time */
            accessTokenExpiresAt: string;
            refreshToken: string;
            /** Format: date-time */
            expiresAt: string;
        };
        SetPassword: {
            name?: components["schemas"]["AccountName"];
            password: components["schemas"]["Password"];
        };
        SetTenantDirectoryListing: {
            listed: boolean;
            reason: string;
        };
        SetupCode: string;
        Signature: string;
        SignIn: {
            phone: components["schemas"]["MobilePhoneNumber"];
            password: string;
            proofOfWork: components["schemas"]["ProofOfWorkSolution"];
        };
        SignInResult: {
            /** @constant */
            step: "otp";
            /** Format: uuid */
            challengeId: string;
        } | {
            /** @constant */
            step: "done";
            ticket: string;
        };
        SignInTicket: {
            ticket: string;
        };
        Specialty: {
            /** Format: uuid */
            id: string;
            code: string;
            nameAr: string;
            nameLatin: string;
            position: number;
        };
        SpecialtyList: components["schemas"]["Specialty"][];
        StaffMember: {
            /** Format: uuid */
            id: string;
            name: string;
            phone: string;
            status: components["schemas"]["MembershipStatus"];
            roles: components["schemas"]["StaffRole"][];
            branchScope: components["schemas"]["BranchScope"];
            adjustments: {
                granted: components["schemas"]["PermissionKey"][];
                revoked: components["schemas"]["PermissionKey"][];
            };
            permissions: components["schemas"]["PermissionKey"][];
            practitionerId: string | null;
            invitationExpiresAt: string | null;
            invitationMessageStatus: components["schemas"]["InvitationMessageStatus"] | null;
            acceptedAt: string | null;
            deactivatedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            archivedAt: string | null;
        };
        StaffPage: {
            items: components["schemas"]["StaffMember"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** @enum {string} */
        StaffRole: "owner" | "doctor" | "reception" | "nurse" | "accountant";
        Tenant: {
            /** Format: uuid */
            id: string;
            nameAr: string;
            nameLatin: string | null;
            status: components["schemas"]["TenantStatus"];
            statusReason: components["schemas"]["TenantStatusReason"] | null;
            /** Format: date-time */
            statusChangedAt: string;
            onboardingCompletedAt: string | null;
            directoryListed: boolean;
            directoryShown: boolean;
            idleLockMinutes: components["schemas"]["IdleLockMinutes"];
            clinicalReadScope: components["schemas"]["ClinicalReadScope"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            archivedAt: string | null;
        };
        TenantLogo: {
            /** @constant */
            contentType: "image/png";
            /** Format: base64 */
            data: string;
            byteSize: number;
            width: number;
            height: number;
            sha256: string;
        };
        TenantPage: {
            items: components["schemas"]["Tenant"][];
            total: number;
            page: number;
            pageSize: number;
        };
        /** @enum {string} */
        TenantStatus: "onboarding" | "active" | "suspended" | "closed";
        /** @enum {string} */
        TenantStatusReason: "non_payment" | "other";
        TotpCode: string;
        UpdateFacility: {
            name: string;
            /** Format: uuid */
            areaId: string;
            addressDetails: string;
            coordinates: components["schemas"]["Coordinates"];
            contactPhones: components["schemas"]["ContactPhone"][];
            defaultCurrency: components["schemas"]["CurrencyCode"];
            workingDays: components["schemas"]["WorkingDays"];
            displayNameFormat: components["schemas"]["DisplayNameFormat"];
            displayCallSound: boolean;
            /** Format: date-time */
            expectedUpdatedAt: string;
        };
        UpdatePlatformUser: {
            role?: components["schemas"]["PlatformRole"];
            disabled?: boolean;
        };
        UpdatePractitioner: {
            displayNameAr: string;
            /** @default null */
            displayNameLatin: string | null;
            gender: components["schemas"]["Gender"];
            specialtyIds: string[];
            /** @default null */
            syndicateNumber: string | null;
            /** Format: date-time */
            expectedUpdatedAt: string;
        };
        UpdateTenantProfile: {
            nameAr: string;
            nameLatin: string | null;
            /** Format: date-time */
            expectedUpdatedAt: string;
        };
        UpdateTenantSecurity: {
            idleLockMinutes: components["schemas"]["IdleLockMinutes"];
            clinicalReadScope: components["schemas"]["ClinicalReadScope"];
            /** Format: date-time */
            expectedUpdatedAt: string;
        };
        WorkingDays: number;
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "JwksController.jwks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Jwks"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AccessController.catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessCatalog"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyLookupController.areas": {
        parameters: {
            query?: {
                parentId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AreaList"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyLookupController.area": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Area"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.requestOtp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OtpChallenge"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.resendOtp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpChallenge"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OtpChallenge"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.verifyOtp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpVerify"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OtpVerified"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.setPassword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetPassword"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignInTicket"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.proofOfWork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProofOfWorkChallenge"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.registrationOptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegistrationOptions"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "AuthController.signIn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignIn"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignInResult"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAccountsController.authorizePasswordReset": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthorizeAccountPasswordReset"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountPasswordResetAuthorized"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAccountsController.changePhone": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeAccountPhone"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleAccount"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAccountsController.lookUp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsoleAccountLookup"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleAccount"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAuthController.reauthenticate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsoleReauth"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleReauthenticated"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAuthController.setUp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsoleSetup"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleSetUp"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAuthController.signIn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsoleSignIn"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleSignInResult"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAuthController.signOut": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionEnded"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleAuthController.totp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsoleTotp"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleMe"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleMeController.me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsoleMe"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "ConsoleMeController.changePassword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangePassword"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PasswordChanged"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PlatformUsersController.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserList"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PlatformUsersController.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePlatformUser"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserSetup"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PlatformUsersController.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePlatformUser"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUser"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PlatformUsersController.reset": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserSetup"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyConsoleController.list": {
        parameters: {
            query?: {
                status?: components["schemas"]["TenantStatus"];
                sort?: "createdAt" | "nameAr" | "statusChangedAt";
                order?: "asc" | "desc";
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantPage"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyConsoleController.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTenant"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyConsoleController.setDirectory": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetTenantDirectoryListing"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyConsoleController.changeStatus": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeTenantStatus"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DeviceManagementController.list": {
        parameters: {
            query?: {
                status?: components["schemas"]["DeviceStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedDeviceList"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDevice"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisteredDevice"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DeviceManagementController.get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedDevice"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DeviceManagementController.rename": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RenameDevice"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedDevice"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DeviceManagementController.removeMember": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                enrollmentId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevokedEnrollment"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DeviceManagementController.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeDevice"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedDevice"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentDevice"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.enroll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Enroll"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Enrolled"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.wiped": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceWiped"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceTokenRequest"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceToken"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "DevicesController.challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceTokenChallenge"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Nonce"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.list": {
        parameters: {
            query?: {
                archived?: string;
                sort?: "createdAt" | "name";
                order?: "asc" | "desc";
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FacilityPage"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateFacility"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Facility"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Facility"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateFacility"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Facility"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.archive": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Facility"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "FacilitiesController.restore": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Facility"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "HealthCheckController.check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthCheck"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenancyLookupController.resolveMapLink": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResolveMapLink"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Coordinates"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "MeController.me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "MeController.changePassword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangePassword"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PasswordChanged"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PractitionerList"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Practitioner"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePractitioner"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Practitioner"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.getPhoto": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PractitionerPhoto"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.replacePhoto": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                };
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PractitionerPhoto"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "PractitionersController.archivePhoto": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Practitioner"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "SessionsController.open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpenSession"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionTokens"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "SessionsController.challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Nonce"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "SessionsController.end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndSession"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionEnded"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "SessionsController.refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshSession"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionTokens"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "SpecialtiesController.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecialtyList"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.list": {
        parameters: {
            query?: {
                status?: components["schemas"]["MembershipStatus"];
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffPage"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.changeAccess": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeStaffAccess"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeactivateStaff"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.resend": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.authorizePasswordReset": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PasswordResetAuthorized"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.previousPractitioner": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreviousPractitioner"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "StaffController.invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateInvitation"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffMember"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.getLogo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantLogo"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.replaceLogo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                };
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantLogo"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.archiveLogo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.completeOnboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.updateProfile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateTenantProfile"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "TenantController.updateSecurity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateTenantSecurity"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tenant"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
