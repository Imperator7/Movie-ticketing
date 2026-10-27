"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { register as registerAccount } from "@/api/generated/endpoints/auth/auth";
import { dataOf } from "@/api/unwrap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/lib/localized";
import { safeNextPath } from "@/lib/safe-redirect";
import { applyServerFieldErrors } from "./field-errors";
import { registerSchema, validationMessageKey, type RegisterValues } from "./schemas";
import { useAuthStore } from "./store";
import { useErrorMessage } from "./use-error-message";

const FIELDS = ["displayName", "email", "password", "confirmPassword"] as const;
type FieldName = (typeof FIELDS)[number];

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const router = useNextRouter();
  const queryClient = useQueryClient();
  const next = useSearchParams().get("next");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterValues) =>
      registerAccount({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        preferredLocale: toLocale(locale),
      }),
    onSuccess: (response) => {
      const session = dataOf(response);
      if (!session) return;
      useAuthStore.getState().setSession(session);
      void queryClient.invalidateQueries();
      router.replace(safeNextPath(next, locale));
    },
    onError: (error) => {
      const translate = (field: string, code: string) =>
        t(`validation.${validationMessageKey(field, code)}`);
      applyServerFieldErrors(error, setError, FIELDS, translate);
      // EMAIL_ALREADY_USED belongs to the email field.
      if (error instanceof Error && "code" in error && error.code === "EMAIL_ALREADY_USED") {
        setError("email", { type: "server", message: errorMessage(error) });
      }
    },
  });

  const messageFor = (field: FieldName) => {
    const error = errors[field];
    if (!error) return undefined;
    return error.type === "server" && error.message
      ? error.message
      : t(`validation.${validationMessageKey(field, error.type)}`);
  };
  const showFormError = mutation.isError && Object.keys(errors).length === 0 && !mutation.isIdle;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  const field = (
    name: FieldName,
    label: string,
    props: React.ComponentProps<typeof Input>,
    hint?: string,
  ) => (
    <Field data-invalid={errors[name] ? true : undefined}>
      <FieldLabel htmlFor={`register-${name}`}>{label}</FieldLabel>
      <Input
        id={`register-${name}`}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `register-${name}-error` : undefined}
        {...props}
        {...register(name)}
      />
      {hint && !errors[name] ? <FieldDescription>{hint}</FieldDescription> : null}
      {errors[name] ? (
        <FieldError id={`register-${name}-error`}>{messageFor(name)}</FieldError>
      ) : null}
    </Field>
  );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          mutation.mutate(values);
        })(event);
      }}
      className="flex flex-col gap-4"
    >
      {showFormError ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      ) : null}
      {field("displayName", t("displayName"), { autoComplete: "name" })}
      {field("email", t("email"), { type: "email", autoComplete: "email", inputMode: "email" })}
      {field(
        "password",
        t("password"),
        { type: "password", autoComplete: "new-password" },
        t("passwordHint"),
      )}
      {field("confirmPassword", t("confirmPassword"), {
        type: "password",
        autoComplete: "new-password",
      })}
      <Button type="submit" size="lg" disabled={mutation.isPending}>
        {mutation.isPending ? t("submitting") : t("submitRegister")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href={loginHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("goLogin")}
        </Link>
      </p>
    </form>
  );
}
