// Generated from apps/api/openapi.json by test/api-schema.test.ts; never edit by hand.
export interface paths {
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AccountName: string;
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
        AuditAction: "tenant.created" | "tenant.status_changed" | "tenant.directory_listing_changed" | "tenant.profile_updated" | "tenant.onboarding_completed" | "tenant_logo.replaced" | "tenant_logo.archived" | "facility.created" | "facility.updated" | "facility.archived" | "facility.restored" | "tenant.security_updated" | "staff.invited" | "staff.invitation_resent" | "staff.invitation_cancelled" | "staff.invitation_accepted" | "staff.access_changed" | "staff.deactivated" | "staff.reactivated" | "staff.password_reset_authorized" | "device.registered" | "device.renamed" | "device.revoked" | "device.wiped" | "device_enrollment.created" | "device_enrollment.revoked" | "staff_session.started" | "practitioner.updated" | "practitioner_photo.replaced" | "practitioner_photo.archived" | "account.created" | "account.password_set" | "account.password_reset_authorized" | "account.phone_changed" | "account.sign_in_locked" | "console.request" | "platform_user.created" | "platform_user.role_changed" | "platform_user.disabled" | "platform_user.enabled" | "platform_user.reset" | "platform_user.setup_completed" | "platform_user.signed_in" | "platform_user.sign_in_failed" | "platform_user.sign_in_locked" | "platform_user.totp_failed" | "platform_user.recovery_code_used" | "platform_user.reauthenticated" | "platform_user.password_changed" | "platform_user.signed_out";
        /** @enum {string} */
        AuditActorKind: "staff" | "patient" | "platform" | "system";
        BranchScope: {
            /** @constant */
            allFacilities: true;
        } | {
            /** @constant */
            allFacilities: false;
            facilityIds: string[];
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
        CreateTenant: {
            nameAr: string;
            nameLatin?: string;
            reason: string;
        };
        /** @enum {string} */
        CurrencyCode: "USD" | "TRY" | "SYP";
        DeviceName: string;
        /** @enum {string} */
        DeviceRevokeCategory: "lost_or_stolen" | "replaced" | "other";
        /** @enum {string} */
        DeviceStatus: "active" | "revoked";
        /** @enum {string} */
        DisplayNameFormat: "ticket_only" | "first_name_father_initial";
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
        ListAreasQuery: {
            /** Format: uuid */
            parentId?: string;
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
        /** @enum {string} */
        MembershipStatus: "invited" | "active" | "deactivated";
        MobilePhoneNumber: components["schemas"]["PhoneNumber"];
        Money: {
            amount: number;
            currency: components["schemas"]["CurrencyCode"];
        };
        OtpCode: string;
        /** @enum {string} */
        OtpPurpose: "device_sign_in" | "first_sign_in" | "password_reset";
        Password: string;
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
        /** @enum {string} */
        PlatformUserStatus: "pending_setup" | "active" | "disabled";
        PractitionerProfileInput: {
            displayNameAr: string;
            /** @default null */
            displayNameLatin: string | null;
            gender: components["schemas"]["Gender"];
            specialtyIds: string[];
            /** @default null */
            syndicateNumber: string | null;
        };
        PublicKey: string;
        RecoveryCode: string;
        ResolveMapLink: {
            /** Format: uri */
            url: string;
        };
        /** @enum {string} */
        SessionEndReason: "signed_out" | "locked" | "expired" | "member_deactivated" | "device_revoked" | "enrollment_revoked" | "password_reset";
        SetTenantDirectoryListing: {
            listed: boolean;
            reason: string;
        };
        SetupCode: string;
        Specialty: {
            /** Format: uuid */
            id: string;
            code: string;
            nameAr: string;
            nameLatin: string;
            position: number;
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
        UpdateTenantProfile: {
            nameAr: string;
            nameLatin: string | null;
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
}
