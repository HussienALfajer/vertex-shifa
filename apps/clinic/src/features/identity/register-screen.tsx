import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { deviceNameSchema, type RegistrationOptions } from '@vertex-shifa/contracts';
import {
  BackButton,
  Button,
  Card,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type SignInFlow, updateSignInFlow, useSignInFlow } from './flow';

type Clinic = RegistrationOptions['clinics'][number];

/**
 * `/register` (screen 3, rule 18): the clinic (skipped with one), the branch (skipped with one;
 * none while an owner's clinic is onboarding without a branch, rule 28) and the computer's name;
 * the PIN step follows.
 */
export function RegisterScreen() {
  const flow = useSignInFlow();
  if (flow?.purpose !== 'register' || flow.clinics.length === 0) {
    return <Navigate to="/welcome" replace />;
  }
  return <RegisterForm flow={flow} />;
}

function RegisterForm({ flow }: { flow: SignInFlow }) {
  const { t } = useTranslation('clinic');
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(
    flow.registration?.tenantId ??
      (flow.clinics.length === 1 ? flow.clinics[0]?.tenantId : undefined),
  );
  const clinic: Clinic | undefined = flow.clinics.find((item) => item.tenantId === tenantId);
  const [facilityId, setFacilityId] = useState(flow.registration?.facilityId ?? undefined);
  const branches = clinic?.branches ?? [];
  const branch =
    branches.length === 1 ? branches[0] : branches.find((item) => item.id === facilityId);
  const [name, setName] = useState(flow.registration?.deviceName ?? '');
  const [checking, setChecking] = useState(false);

  const errors = {
    clinic: checking && !clinic ? t('identity.register.clinicRequired') : undefined,
    branch:
      checking && clinic && branches.length > 0 && !branch
        ? t('identity.register.branchRequired')
        : undefined,
    name:
      checking && !deviceNameSchema.safeParse(name).success
        ? t('identity.register.nameInvalid')
        : undefined,
  };

  function submit(): boolean {
    setChecking(true);
    if (!clinic || (branches.length > 0 && !branch) || !deviceNameSchema.safeParse(name).success) {
      return false;
    }
    updateSignInFlow({
      registration: {
        tenantId: clinic.tenantId,
        clinicName: clinic.nameAr,
        clinicNameLatin: clinic.nameLatin,
        roles: clinic.roles,
        facilityId: branch?.id ?? null,
        facilityName: branch?.name ?? null,
        deviceName: name.trim(),
      },
    });
    void navigate({ to: '/pin/new' });
    return true;
  }

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/welcome" />}>{t('identity.welcome.back')}</BackButton>}
        title={t('identity.register.title')}
        description={t('identity.register.description')}
      />
      <Form onSubmit={submit}>
        <Card className="flex flex-col gap-6 p-6">
          <FormFields>
            {flow.clinics.length > 1 ? (
              <Field invalid={errors.clinic !== undefined}>
                <FieldLabel>{t('identity.register.clinic')}</FieldLabel>
                <Select
                  value={tenantId ?? null}
                  onValueChange={(value) => {
                    if (value && value !== tenantId) {
                      setTenantId(value);
                      setFacilityId(undefined);
                    }
                  }}
                  items={flow.clinics.map((item) => ({ value: item.tenantId, label: item.nameAr }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('identity.register.clinicPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {flow.clinics.map((item) => (
                      <SelectItem key={item.tenantId} value={item.tenantId}>
                        {item.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError match={errors.clinic !== undefined}>{errors.clinic}</FieldError>
              </Field>
            ) : (
              <p className="text-base">
                {t('identity.register.oneClinic', { clinic: clinic?.nameAr ?? '' })}
              </p>
            )}
            {clinic && branches.length > 1 && (
              <Field invalid={errors.branch !== undefined}>
                <FieldLabel>{t('identity.register.branch')}</FieldLabel>
                <Select
                  value={facilityId ?? null}
                  onValueChange={(value) => value && setFacilityId(value)}
                  items={branches.map((item) => ({ value: item.id, label: item.name }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('identity.register.branchPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t('identity.register.branchHint')}</FieldDescription>
                <FieldError match={errors.branch !== undefined}>{errors.branch}</FieldError>
              </Field>
            )}
            {clinic && branches.length === 1 && (
              <p className="text-base">
                {t('identity.register.oneBranch', { branch: branch?.name ?? '' })}
              </p>
            )}
            {clinic && branches.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('identity.register.noBranchYet')}</p>
            )}
            <Field invalid={errors.name !== undefined}>
              <FieldLabel>{t('identity.register.name')}</FieldLabel>
              <Input
                value={name}
                onValueChange={setName}
                placeholder={t('identity.register.namePlaceholder')}
                maxLength={50}
              />
              <FieldDescription>{t('identity.register.nameHint')}</FieldDescription>
              <FieldError match={errors.name !== undefined}>{errors.name}</FieldError>
            </Field>
          </FormFields>
          <FormActions>
            <Button type="submit">{t('identity.register.next')}</Button>
          </FormActions>
        </Card>
      </Form>
    </section>
  );
}
