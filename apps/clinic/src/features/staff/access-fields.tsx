import {
  type AccessCatalog,
  roles as allRoles,
  type Facility,
  type PermissionGroup,
  type Role,
} from '@vertex-shifa/contracts';
import { Badge, Checkbox } from '@vertex-shifa/ui';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import {
  type AccessDraft,
  type AccessErrors,
  type PermissionRow,
  permissionRows,
  setPermission,
  setRoles,
} from './access-draft';
import { useRoleNames } from './staff-labels';

type AccessFieldsProps = {
  draft: AccessDraft;
  onChange: (draft: AccessDraft) => void;
  catalog: AccessCatalog;
  errors: AccessErrors;
  disabled: boolean;
  /** The owner role is offered to owners only (rule 5); others see it only on an owner. */
  offerOwner: boolean;
  /** The branches in use; the scope shows with two or more, or when the member has a list. */
  branches: Facility[];
};

/** Roles, branch scope and the permission editor of a member (screen 7). */
export function AccessFields({
  draft,
  onChange,
  catalog,
  errors,
  disabled,
  offerOwner,
  branches,
}: AccessFieldsProps) {
  const { t } = useTranslation('clinic');
  const owner = draft.roles.includes('owner');
  const shownRoles = allRoles.filter((role) => role !== 'owner' || offerOwner || owner);
  const toggleRole = (role: Role, on: boolean) =>
    onChange(
      setRoles(
        draft,
        // Kept in the catalog's order.
        allRoles.filter((item) => (item === role ? on : draft.roles.includes(item))),
      ),
    );
  const toggleBranch = (id: string, on: boolean) =>
    onChange({
      ...draft,
      facilityIds: on
        ? [...draft.facilityIds, id]
        : draft.facilityIds.filter((item) => item !== id),
    });

  return (
    <>
      <FieldGroup
        legend={t('staff.fields.roles.label')}
        error={errors.roles && t('staff.fields.roles.invalid')}
        disabled={disabled}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {shownRoles.map((role) => (
            <CheckboxRow
              key={role}
              label={t(`roles.${role}`)}
              checked={draft.roles.includes(role)}
              disabled={disabled || (role === 'owner' && !offerOwner)}
              onChange={(on) => toggleRole(role, on)}
            />
          ))}
        </div>
      </FieldGroup>
      {(branches.length >= 2 || !draft.allFacilities) && (
        <FieldGroup
          legend={t('staff.fields.branches.label')}
          description={
            owner ? t('staff.fields.branches.ownerAll') : t('staff.fields.branches.description')
          }
          error={errors.branches && t('staff.fields.branches.invalid')}
          disabled={disabled || owner}
        >
          <CheckboxRow
            label={t('staff.fields.branches.all')}
            checked={draft.allFacilities || owner}
            disabled={disabled || owner}
            onChange={(allFacilities) => onChange({ ...draft, allFacilities })}
          />
          {!draft.allFacilities && !owner && (
            <div className="flex flex-col gap-2 ps-7">
              {branches.map((branch) => (
                <CheckboxRow
                  key={branch.id}
                  label={branch.name}
                  checked={draft.facilityIds.includes(branch.id)}
                  disabled={disabled}
                  onChange={(on) => toggleBranch(branch.id, on)}
                />
              ))}
            </div>
          )}
        </FieldGroup>
      )}
      <PermissionEditor draft={draft} onChange={onChange} catalog={catalog} disabled={disabled} />
    </>
  );
}

function CheckboxRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control.
    <label className="flex w-fit items-center gap-2 text-base">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

/**
 * The permissions grouped as in the catalog, each "from role", "added" or "removed"; those outside
 * the limits of the member's roles, or that an owner always keeps, are disabled and say why.
 */
function PermissionEditor({
  draft,
  onChange,
  catalog,
  disabled,
}: {
  draft: AccessDraft;
  onChange: (draft: AccessDraft) => void;
  catalog: AccessCatalog;
  disabled: boolean;
}) {
  const { t } = useTranslation('clinic');
  const rows = permissionRows(catalog, draft);
  const groups = [...new Set(rows.map((row) => row.permission.group))];
  return (
    <FieldGroup
      legend={t('staff.permissions.title')}
      description={
        draft.roles.length === 0
          ? t('staff.permissions.chooseRole')
          : t('staff.permissions.description')
      }
      disabled={disabled}
    >
      {draft.roles.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-muted-foreground">
                {t(`staff.permissionGroups.${group as PermissionGroup}`)}
              </h3>
              <ul className="flex flex-col gap-2">
                {rows
                  .filter((row) => row.permission.group === group)
                  .map((row) => (
                    <PermissionItem
                      key={row.permission.key}
                      row={row}
                      disabled={disabled}
                      onChange={(held) =>
                        onChange(setPermission(catalog, draft, row.permission.key, held))
                      }
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </FieldGroup>
  );
}

function PermissionItem({
  row,
  disabled,
  onChange,
}: {
  row: PermissionRow;
  disabled: boolean;
  onChange: (held: boolean) => void;
}) {
  const { t } = useTranslation('clinic');
  const roleNames = useRoleNames();
  const { permission, origin, blocked } = row;
  const notes = [
    blocked === 'limit' && permission.limit !== 'any'
      ? t('staff.permissions.limitedTo', { roles: roleNames(permission.limit) })
      : undefined,
    blocked === 'ownerLocked' ? t('staff.permissions.ownerLocked') : undefined,
    permission.branchScoped && blocked !== 'limit'
      ? t('staff.permissions.branchScoped')
      : undefined,
  ].filter((note) => note !== undefined);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <CheckboxRow
        label={t(`staff.permissionNames.${permission.key}`)}
        checked={row.held}
        disabled={disabled || blocked !== null}
        onChange={onChange}
      />
      {origin !== 'none' && (
        <Badge tone={origin === 'added' ? 'success' : origin === 'removed' ? 'warning' : 'neutral'}>
          {t(`staff.permissions.origin.${origin}`)}
        </Badge>
      )}
      {notes.length > 0 && (
        <span className="text-sm text-muted-foreground">{notes.join(t('roles.separator'))}</span>
      )}
    </li>
  );
}
