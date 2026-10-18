ALTER TABLE "staff_memberships" DROP CONSTRAINT "staff_memberships_roles";--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_roles" CHECK (cardinality("staff_memberships"."roles") between 1 and 5 and "staff_memberships"."roles" <@ array['owner', 'doctor', 'reception', 'nurse', 'accountant']
        and cardinality("staff_memberships"."roles") = ('owner' = any("staff_memberships"."roles"))::int + ('doctor' = any("staff_memberships"."roles"))::int
          + ('reception' = any("staff_memberships"."roles"))::int + ('nurse' = any("staff_memberships"."roles"))::int
          + ('accountant' = any("staff_memberships"."roles"))::int);